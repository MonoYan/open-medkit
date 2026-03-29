import { describe, expect, it } from 'vitest';

import type { Medicine } from './medicine';
import {
  buildEmptyBoxAnswer,
  buildInventoryAnswer,
  buildMatchedAnswer,
  collectMatchedMedicines,
  collectMentionedMedicinesFromText,
  extractIdsFromAnswer,
  getSafeQueryStreamChunk,
  isInventoryQuestion,
  normalizeIdList,
  resolveQueryResult,
  sanitizeQueryAnswer,
  stripQueryMetadata,
} from './query';

function makeMedicine(overrides: Partial<Medicine> & { id: number; name: string }): Medicine {
  return {
    name_en: '',
    spec: '',
    quantity: '',
    expires_at: '',
    category: '',
    usage_desc: '',
    location: '',
    notes: '',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('normalizeIdList', () => {
  it('extracts numbers from an array', () => {
    expect(normalizeIdList([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('converts string numbers', () => {
    expect(normalizeIdList(['1', '3'])).toEqual([1, 3]);
  });

  it('filters out non-numeric values', () => {
    expect(normalizeIdList([1, 'abc', null, undefined, 3])).toEqual([1, 3]);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeIdList(undefined)).toEqual([]);
    expect(normalizeIdList(null)).toEqual([]);
    expect(normalizeIdList('123')).toEqual([]);
  });
});

describe('isInventoryQuestion', () => {
  it('detects inventory questions', () => {
    expect(isInventoryQuestion('家里都有什么药')).toBe(true);
    expect(isInventoryQuestion('药箱里有什么药？')).toBe(true);
    expect(isInventoryQuestion('所有药')).toBe(true);
    expect(isInventoryQuestion('药品清单')).toBe(true);
    expect(isInventoryQuestion('全部药')).toBe(true);
  });

  it('ignores whitespace', () => {
    expect(isInventoryQuestion('家里 都 有 什么 药')).toBe(true);
  });

  it('returns false for non-inventory questions', () => {
    expect(isInventoryQuestion('有没有退烧药')).toBe(false);
    expect(isInventoryQuestion('头疼吃什么')).toBe(false);
  });
});

describe('extractIdsFromAnswer', () => {
  it('extracts from [[MEDKIT_IDS:...]] marker', () => {
    const answer = '一些文字\n[[MEDKIT_IDS:1,3,5]]';
    expect(extractIdsFromAnswer(answer)).toEqual([1, 3, 5]);
  });

  it('extracts from legacy [ids:...] marker', () => {
    const answer = '一些文字 [ids: 2, 4]';
    expect(extractIdsFromAnswer(answer)).toEqual([2, 4]);
  });

  it('deduplicates IDs across both formats', () => {
    const answer = '[[MEDKIT_IDS:1,2]] [ids: 2, 3]';
    const ids = extractIdsFromAnswer(answer);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
  });

  it('returns empty array when no markers', () => {
    expect(extractIdsFromAnswer('no markers here')).toEqual([]);
  });
});

describe('stripQueryMetadata', () => {
  it('removes [[MEDKIT_IDS:...]] from end', () => {
    expect(stripQueryMetadata('answer text\n[[MEDKIT_IDS:1,3]]')).toBe('answer text');
  });

  it('removes [ids:...] from end', () => {
    expect(stripQueryMetadata('answer text [ids: 1,2]')).toBe('answer text');
  });

  it('returns the same text if no marker', () => {
    expect(stripQueryMetadata('plain text')).toBe('plain text');
  });

  it('trims whitespace', () => {
    expect(stripQueryMetadata('  text  ')).toBe('text');
  });
});

describe('collectMatchedMedicines', () => {
  const medicines = [
    makeMedicine({ id: 1, name: '布洛芬' }),
    makeMedicine({ id: 2, name: '创可贴' }),
    makeMedicine({ id: 3, name: '维C泡腾片' }),
  ];

  it('matches by medicine_ids', () => {
    const result = collectMatchedMedicines({ medicine_ids: [1, 3] }, medicines);
    expect(result.map((m) => m.id)).toEqual([1, 3]);
  });

  it('matches by ids key', () => {
    const result = collectMatchedMedicines({ ids: [2] }, medicines);
    expect(result.map((m) => m.id)).toEqual([2]);
  });

  it('matches by name', () => {
    const result = collectMatchedMedicines({ name: '布洛芬' }, medicines);
    expect(result.map((m) => m.id)).toEqual([1]);
  });

  it('matches by nested medicines array', () => {
    const payload = { medicines: [{ id: 1 }, { id: 2 }] };
    const result = collectMatchedMedicines(payload, medicines);
    expect(result.map((m) => m.id)).toEqual([1, 2]);
  });

  it('deduplicates matches', () => {
    const payload = { medicine_ids: [1], medicines: [{ id: 1 }] };
    const result = collectMatchedMedicines(payload, medicines);
    expect(result).toHaveLength(1);
  });

  it('returns empty for no matches', () => {
    expect(collectMatchedMedicines({ medicine_ids: [99] }, medicines)).toEqual([]);
  });
});

describe('collectMentionedMedicinesFromText', () => {
  const medicines = [
    makeMedicine({ id: 1, name: '布洛芬缓释胶囊', name_en: 'Ibuprofen' }),
    makeMedicine({ id: 2, name: '创可贴' }),
  ];

  it('finds medicines mentioned by Chinese name', () => {
    const result = collectMentionedMedicinesFromText('可以用布洛芬缓释胶囊', medicines);
    expect(result.map((m) => m.id)).toEqual([1]);
  });

  it('finds medicines mentioned by English name', () => {
    const result = collectMentionedMedicinesFromText('Try ibuprofen', medicines);
    expect(result.map((m) => m.id)).toEqual([1]);
  });

  it('returns empty for no matches', () => {
    expect(collectMentionedMedicinesFromText('没有提到任何药品', medicines)).toEqual([]);
  });

  it('returns empty for empty text', () => {
    expect(collectMentionedMedicinesFromText('', medicines)).toEqual([]);
  });
});

describe('getSafeQueryStreamChunk', () => {
  it('returns text before a marker', () => {
    const buffer = 'answer text [[MEDKIT_IDS:1,2]]';
    expect(getSafeQueryStreamChunk(buffer)).toBe('answer text ');
  });

  it('holds back text at the end that might be a partial marker', () => {
    const buffer = 'some text [[MEDK';
    const safe = getSafeQueryStreamChunk(buffer);
    expect(safe.length).toBeLessThan(buffer.length);
  });

  it('returns empty for very short buffers', () => {
    expect(getSafeQueryStreamChunk('ab')).toBe('');
  });

  it('returns all text when buffer is longer than holdback and no marker', () => {
    const buffer = 'a'.repeat(50);
    const safe = getSafeQueryStreamChunk(buffer);
    expect(safe.length).toBeGreaterThan(0);
    expect(safe.length).toBeLessThan(buffer.length);
  });
});

describe('sanitizeQueryAnswer', () => {
  it('collapses excessive blank lines', () => {
    expect(sanitizeQueryAnswer('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims whitespace', () => {
    expect(sanitizeQueryAnswer('  text  ')).toBe('text');
  });
});

describe('buildEmptyBoxAnswer', () => {
  it('returns concise answer by default', () => {
    const result = buildEmptyBoxAnswer('concise');
    expect(result).toContain('药箱是空的');
  });

  it('returns detailed answer with tips', () => {
    const result = buildEmptyBoxAnswer('detailed');
    expect(result).toContain('药箱目前是空的');
    expect(result).toContain('AI 解析');
  });
});

describe('buildMatchedAnswer', () => {
  const meds = [
    makeMedicine({ id: 1, name: '布洛芬', expires_at: '2028-01-01', category: '感冒发烧' }),
  ];

  it('returns "no match" message for empty list', () => {
    const result = buildMatchedAnswer([], '2026-03-29', '2026-04-28', 30, 'concise');
    expect(result).toContain('没有相关药品');
  });

  it('lists matched medicines', () => {
    const result = buildMatchedAnswer(meds, '2026-03-29', '2026-04-28', 30, 'concise');
    expect(result).toContain('布洛芬');
    expect(result).toContain('1');
  });
});

describe('buildInventoryAnswer', () => {
  const meds = [
    makeMedicine({ id: 1, name: '布洛芬', expires_at: '2025-01-01', category: '感冒发烧' }),
    makeMedicine({ id: 2, name: '创可贴', expires_at: '2028-01-01', category: '外伤处理' }),
  ];

  it('includes summary stats', () => {
    const result = buildInventoryAnswer(meds, '2026-03-29', '2026-04-28', 30, 'concise');
    expect(result).toContain('2');
    expect(result).toContain('已过期');
  });

  it('includes category distribution in detailed mode', () => {
    const result = buildInventoryAnswer(meds, '2026-03-29', '2026-04-28', 30, 'detailed');
    expect(result).toContain('分类分布');
  });
});

describe('resolveQueryResult', () => {
  const medicines = [
    makeMedicine({ id: 1, name: '布洛芬缓释胶囊', expires_at: '2028-01-01' }),
    makeMedicine({ id: 2, name: '创可贴', expires_at: '2028-01-01' }),
  ];

  it('extracts answer and medicines from JSON response', () => {
    const raw = JSON.stringify({
      answer: '推荐使用布洛芬缓释胶囊',
      medicine_ids: [1],
    });
    const result = resolveQueryResult(raw, medicines, '2026-03-29', '2026-04-28', 30, 'concise');
    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.answer).toContain('布洛芬');
      expect(result.data.medicines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles plain text answers with medicine names', () => {
    const raw = '你可以使用布洛芬缓释胶囊来退烧。\n[[MEDKIT_IDS:1]]';
    const result = resolveQueryResult(raw, medicines, '2026-03-29', '2026-04-28', 30, 'concise');
    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.medicines.map((m) => m.id)).toContain(1);
    }
  });

  it('returns error for empty/invalid response', () => {
    const result = resolveQueryResult('', medicines, '2026-03-29', '2026-04-28', 30, 'concise');
    expect('error' in result).toBe(true);
  });
});
