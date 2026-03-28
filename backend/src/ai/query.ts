import { isRecord } from './json-utils';
import { parseAiJsonResponse } from './json-utils';
import type { Medicine } from './medicine';
import { getMedicineExpiryState } from './medicine';
import type { QueryResponseStyle } from './types';

// ---------------------------------------------------------------------------
// ID / name matching
// ---------------------------------------------------------------------------

export function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) => {
      if (typeof item === 'number' && Number.isFinite(item)) {
        return item;
      }

      if (typeof item === 'string') {
        const numeric = Number(item);
        return Number.isFinite(numeric) ? numeric : null;
      }

      return null;
    })
    .filter((item): item is number => item !== null);
}

function matchMedicineByName(medicines: Medicine[], name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (!normalizedName) {
    return undefined;
  }

  return medicines.find((medicine) => {
    const medicineNames = [medicine.name, medicine.name_en].filter(Boolean).map((item) =>
      item.toLowerCase(),
    );

    return medicineNames.some(
      (candidate) =>
        candidate === normalizedName ||
        candidate.includes(normalizedName) ||
        normalizedName.includes(candidate),
    );
  });
}

export function collectMatchedMedicines(payload: unknown, medicines: Medicine[]) {
  const matched = new Map<number, Medicine>();

  const addById = (id: number) => {
    const medicine = medicines.find((item) => item.id === id);

    if (medicine) {
      matched.set(medicine.id, medicine);
    }
  };

  const addByName = (name: string) => {
    const medicine = matchMedicineByName(medicines, name);

    if (medicine) {
      matched.set(medicine.id, medicine);
    }
  };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    normalizeIdList(value.medicine_ids).forEach(addById);
    normalizeIdList(value.ids).forEach(addById);
    normalizeIdList(value.medicineIds).forEach(addById);

    if (typeof value.id === 'number') {
      addById(value.id);
    } else if (typeof value.id === 'string') {
      const numericId = Number(value.id);
      if (Number.isFinite(numericId)) {
        addById(numericId);
      }
    }

    if (typeof value.name === 'string') {
      addByName(value.name);
    }

    if (typeof value.name_en === 'string') {
      addByName(value.name_en);
    }

    if (Array.isArray(value.medicines)) {
      value.medicines.forEach(visit);
    }

    if (Array.isArray(value.items)) {
      value.items.forEach(visit);
    }
  };

  visit(payload);

  return Array.from(matched.values());
}

// ---------------------------------------------------------------------------
// Inventory / fast-path detection
// ---------------------------------------------------------------------------

export function isInventoryQuestion(question: string) {
  const normalized = question.replace(/\s+/g, '');
  const patterns = [
    '家里都有什么药',
    '家里有什么药',
    '药箱里都有什么药',
    '药箱里有什么药',
    '都有什么药',
    '有什么药',
    '所有药',
    '全部药',
    '药品清单',
    '药物清单',
  ];

  return patterns.some((pattern) => normalized.includes(pattern));
}

// ---------------------------------------------------------------------------
// Marker extraction & cleanup
// ---------------------------------------------------------------------------

const QUERY_ID_MARKER = '[[MEDKIT_IDS:';
const LEGACY_ID_MARKER = '[ids:';

function parseIdText(value: string) {
  return value
    .split(/[,\s，、；;]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

export function extractIdsFromAnswer(answer: string) {
  const matches = [
    answer.match(/\[\[MEDKIT_IDS:\s*([^\]]*?)\s*\]\]/i)?.[1],
    answer.match(/\[ids:\s*([^\]]*?)\s*\]/i)?.[1],
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(matches.flatMap(parseIdText)));
}

export function stripQueryMetadata(answer: string) {
  return answer
    .replace(/\s*(\[\[MEDKIT_IDS:\s*[^\]]*?\s*\]\]|\[ids:\s*[^\]]*?\s*\])\s*$/i, '')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');
}

export function collectMentionedMedicinesFromText(answer: string, medicines: Medicine[]) {
  const normalizedAnswer = answer.trim().toLowerCase();

  if (!normalizedAnswer) {
    return [] as Medicine[];
  }

  return medicines.filter((medicine) => {
    const candidates = [medicine.name, medicine.name_en]
      .filter(Boolean)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length >= 2);

    return candidates.some((candidate) => normalizedAnswer.includes(candidate));
  });
}

export function getSafeQueryStreamChunk(buffer: string) {
  const markerIndex = Math.max(buffer.lastIndexOf(QUERY_ID_MARKER), buffer.lastIndexOf(LEGACY_ID_MARKER));

  if (markerIndex >= 0) {
    return buffer.slice(0, markerIndex);
  }

  const holdBackLength = Math.max(QUERY_ID_MARKER.length, LEGACY_ID_MARKER.length) - 1;

  if (buffer.length <= holdBackLength) {
    return '';
  }

  return buffer.slice(0, buffer.length - holdBackLength);
}

// ---------------------------------------------------------------------------
// Answer builders
// ---------------------------------------------------------------------------

function formatMedicineBullet(
  medicine: Medicine,
  todayStr: string,
  in30daysStr: string,
) {
  const status = getMedicineExpiryState(medicine, todayStr, in30daysStr);
  const tags: string[] = [];

  if (status === 'expired') {
    tags.push('已过期');
  } else if (status === 'expiring') {
    tags.push('快到期');
  }

  if (medicine.category) {
    tags.push(medicine.category);
  }

  return `- **${medicine.name}**${tags.length > 0 ? `：${tags.join(' · ')}` : ''}`;
}

function buildQueryNotes(
  medicines: Medicine[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
) {
  const expired = medicines.filter(
    (medicine) => getMedicineExpiryState(medicine, todayStr, in30daysStr) === 'expired',
  );
  const expiring = medicines.filter(
    (medicine) => getMedicineExpiryState(medicine, todayStr, in30daysStr) === 'expiring',
  );
  const lines: string[] = [];

  if (expired.length > 0 || expiring.length > 0) {
    lines.push('### 注意事项');
  }

  if (expired.length > 0) {
    lines.push(`- **已过期**：${expired.map((medicine) => medicine.name).join('、')}，请勿继续使用`);
  }

  if (expiring.length > 0) {
    lines.push(`- **${expiringDays} 天内到期**：${expiring.map((medicine) => medicine.name).join('、')}`);
  }

  return lines;
}

export function buildInventoryAnswer(
  medicines: Medicine[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const expired = medicines.filter(
    (medicine) => getMedicineExpiryState(medicine, todayStr, in30daysStr) === 'expired',
  );
  const expiring = medicines.filter(
    (medicine) => getMedicineExpiryState(medicine, todayStr, in30daysStr) === 'expiring',
  );
  const previewNames = medicines
    .slice(0, 5)
    .map((medicine) => `**${medicine.name}**`)
    .join('、');
  const lines = [
    '### 药箱概况',
    `- 共 **${medicines.length}** 种药；已过期 **${expired.length}** 种；${expiringDays} 天内到期 **${expiring.length}** 种`,
    previewNames
      ? `- 常见药品：${previewNames}${medicines.length > 5 ? ` 等 ${medicines.length} 种` : ''}`
      : '- 下方卡片可查看完整清单',
  ];

  if (responseStyle === 'detailed') {
    const categorySummary = new Map<string, number>();

    medicines.forEach((medicine) => {
      const key = medicine.category || '未分类';
      categorySummary.set(key, (categorySummary.get(key) || 0) + 1);
    });

    const topCategories = Array.from(categorySummary.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} ${count} 种`);

    if (topCategories.length > 0) {
      lines.push(`- 分类分布：${topCategories.join('，')}`);
    }
  }

  const notes = buildQueryNotes(medicines, todayStr, in30daysStr, expiringDays);

  if (notes.length > 0) {
    lines.push('', ...notes);
  }

  return lines.join('\n');
}

export function buildMatchedAnswer(
  medicines: Medicine[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  if (medicines.length === 0) {
    return '### 查询结果\n药箱中没有相关药品。';
  }

  const preview = medicines.slice(0, 3);
  let displayedCount = preview.length;
  const lines = [
    '### 查询结果',
    `- 找到 **${medicines.length}** 个相关药品`,
    ...preview.map((medicine) => formatMedicineBullet(medicine, todayStr, in30daysStr)),
  ];

  if (responseStyle === 'detailed' && medicines.length > 0) {
    const extraPreview = medicines.slice(preview.length, preview.length + 2);

    extraPreview.forEach((medicine) => {
      lines.push(formatMedicineBullet(medicine, todayStr, in30daysStr));
    });
    displayedCount += extraPreview.length;
  }

  if (medicines.length > displayedCount) {
    lines.push(`- 其余结果请看下方药品卡片`);
  }

  const notes = buildQueryNotes(medicines, todayStr, in30daysStr, expiringDays);

  if (notes.length > 0) {
    lines.push('', ...notes);
  }

  return lines.join('\n');
}

export function buildEmptyBoxAnswer(responseStyle: QueryResponseStyle) {
  if (responseStyle === 'detailed') {
    return '### 药箱状态\n药箱目前是空的，请先添加药品。\n- 可以先用 AI 解析录入常备药\n- 录入后我就能帮你按症状和有效期检索';
  }

  return '### 药箱状态\n药箱是空的，请先添加药品。';
}

/**
 * Minimal cleanup: collapse excessive blank lines and trim.
 * Semantic-level suppression (e.g. "就医建议" sections) is delegated to
 * the prompt rather than brittle regex post-processing.
 */
export function sanitizeQueryAnswer(answer: string) {
  return answer.replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Resolve AI query result into final answer + matched medicines
// ---------------------------------------------------------------------------

/**
 * Merge matched medicine lists by id, preserving insertion order.
 */
function mergeMatched(...lists: Medicine[][]) {
  const seen = new Map<number, Medicine>();
  for (const list of lists) {
    for (const m of list) {
      if (!seen.has(m.id)) seen.set(m.id, m);
    }
  }
  return Array.from(seen.values());
}

export function resolveQueryResult(
  raw: string,
  medicines: Medicine[],
  todayStr: string,
  in30daysStr: string,
  expiringDays: number,
  responseStyle: QueryResponseStyle,
) {
  const parsed = parseAiJsonResponse<{
    answer?: string;
    medicine_ids?: number[];
    ids?: number[];
    id?: number | string;
    name?: string;
    medicines?: Array<{ id?: number | string; name?: string }>;
  } | null>(raw);

  // Primary: match medicine names mentioned in the answer text
  const strippedText = stripQueryMetadata(raw);
  const matchedFromText = collectMentionedMedicinesFromText(strippedText, medicines);

  // Supplement: structured IDs from marker or JSON payload (fallback for names
  // not literally appearing in the text)
  const matchedFromMarker = collectMatchedMedicines(
    { medicine_ids: extractIdsFromAnswer(raw) },
    medicines,
  );
  const matchedFromPayload =
    parsed && isRecord(parsed)
      ? collectMatchedMedicines(
          {
            medicine_ids: parsed.medicine_ids,
            ids: parsed.ids,
            id: parsed.id,
            name: parsed.name,
            medicines: parsed.medicines,
          },
          medicines,
        )
      : [];

  const matched = mergeMatched(matchedFromText, matchedFromMarker, matchedFromPayload);

  const parsedAnswer =
    parsed && isRecord(parsed) && typeof parsed.answer === 'string'
      ? sanitizeQueryAnswer(stripQueryMetadata(parsed.answer))
      : '';
  const answer = parsedAnswer.trim() || sanitizeQueryAnswer(strippedText).trim();

  if (answer) {
    return {
      data: {
        answer,
        medicines: matched,
      },
    };
  }

  if (matched.length > 0) {
    return {
      data: {
        answer: buildMatchedAnswer(
          matched,
          todayStr,
          in30daysStr,
          expiringDays,
          responseStyle,
        ),
        medicines: matched,
      },
    };
  }

  return { error: 'AI returned invalid format', raw };
}
