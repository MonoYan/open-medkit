import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getDb } from './db/client';
import { DEFAULT_CATEGORIES } from './db/schema';

// ---------------------------------------------------------------------------
// DB helpers (mirrors logic from routes/medicines.ts & ai/medicine.ts)
// ---------------------------------------------------------------------------

interface MedicineRecord {
  id: number;
  name: string;
  name_en: string | null;
  spec: string | null;
  quantity: string | null;
  expires_at: string | null;
  category: string | null;
  usage_desc: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function rowToMedicine(row: MedicineRecord) {
  return {
    ...row,
    name_en: row.name_en || '',
    spec: row.spec || '',
    quantity: row.quantity || '',
    expires_at: row.expires_at || '',
    category: row.category || '',
    usage_desc: row.usage_desc || '',
    location: row.location || '',
    notes: row.notes || '',
  };
}

function getDateBoundaries(expiringDays = 30) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const warning = new Date(today);
  warning.setDate(warning.getDate() + expiringDays);
  return { todayStr, warningDateStr: warning.toISOString().slice(0, 10) };
}

function getMergedCategories() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT category FROM medicines WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`,
    )
    .all() as { category: string }[];
  const merged = [...DEFAULT_CATEGORIES];
  for (const { category } of rows) {
    if (!merged.includes(category)) {
      merged.push(category);
    }
  }
  return merged;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '感冒发烧': [
    '布洛芬', '对乙酰氨基酚', '扑热息痛', '感冒', '退烧', '发烧', '头痛', '止痛',
    '阿司匹林', '泰诺', '美林', '连花清瘟', '板蓝根', '感康', '新康泰克', '白加黑',
    '快克', '抗病毒', '咳嗽', '止咳', '化痰', '川贝', '枇杷', '右美沙芬',
    'ibuprofen', 'paracetamol', 'acetaminophen', 'aspirin',
  ],
  '外伤处理': [
    '创可贴', '碘伏', '酒精', '消毒', '纱布', '绷带', '棉签', '红药水', '紫药水',
    '云南白药', '止血', '伤口', '碘酒', '双氧水', '医用胶带',
    'band-aid', 'bandage', 'iodine',
  ],
  '慢性病用药': [
    '降压', '降糖', '胰岛素', '二甲双胍', '高血压', '糖尿病', '心血管',
    '他汀', '阿托伐', '硝苯地平', '氨氯地平', '缬沙坦', '降脂',
    '甲状腺', '优甲乐', '左甲状腺',
  ],
  '维生素补剂': [
    '维生素', '维C', '维B', '钙片', '鱼油', 'DHA', '补铁', '叶酸', '泡腾片',
    '补锌', '多维', '善存', '钙尔奇', 'vitamin', '辅酶Q10', '褪黑素',
  ],
  '皮肤外用': [
    '药膏', '软膏', '乳膏', '凝胶', '皮炎', '湿疹', '止痒',
    '红霉素软膏', '百多邦', '派瑞松', '炉甘石', '芦荟胶', '痤疮', '脚气',
    '达克宁', '皮康王', '风油精', '花露水', '防晒',
  ],
  '消化系统': [
    '藿香正气', '健胃消食', '消化', '胃痛', '拉肚子', '腹泻', '便秘', '开塞露',
    '蒙脱石', '益生菌', '肠胃', '奥美拉唑', '吗丁啉', '胃药', '止泻',
    '乳酸菌', '整肠', '泻药',
  ],
};

function inferCategory(name: string, usageDesc?: string): string {
  const text = `${name} ${usageDesc || ''}`.toLowerCase();

  let bestCategory = '';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function computeStats(expiringDays = 30) {
  const db = getDb();
  const { todayStr, warningDateStr } = getDateBoundaries(expiringDays);

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at < ? THEN 1 ELSE 0 END) AS expired,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ? THEN 1 ELSE 0 END) AS expiring,
         SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at > ? THEN 1 ELSE 0 END) AS ok
       FROM medicines`,
    )
    .get(todayStr, todayStr, warningDateStr, warningDateStr) as {
    total: number;
    expired: number | null;
    expiring: number | null;
    ok: number | null;
  };

  const categories = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM medicines
       WHERE category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY count DESC, category ASC`,
    )
    .all() as { category: string; count: number }[];

  return {
    total: totals.total || 0,
    expired: totals.expired || 0,
    expiring: totals.expiring || 0,
    ok: totals.ok || 0,
    expiring_days: expiringDays,
    categories,
    available_categories: getMergedCategories(),
  };
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'open-medkit',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  'list_medicines',
  'List all medicines in the medkit. Supports filtering by category, expiry status, or name search.',
  {
    category: z.string().optional().describe('Filter by category name'),
    status: z.enum(['expired', 'expiring', 'ok']).optional().describe('Filter by expiry status'),
    search: z.string().optional().describe('Fuzzy search on name'),
    expiring_days: z.number().positive().optional().describe('Days threshold for "expiring" status (default: 30)'),
  },
  async ({ category, status, search, expiring_days }) => {
    try {
      const db = getDb();
      const { todayStr, warningDateStr } = getDateBoundaries(expiring_days);
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }

      if (status === 'expired') {
        conditions.push("expires_at IS NOT NULL AND expires_at != '' AND expires_at < ?");
        params.push(todayStr);
      } else if (status === 'expiring') {
        conditions.push("expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ?");
        params.push(todayStr, warningDateStr);
      } else if (status === 'ok') {
        conditions.push("expires_at IS NOT NULL AND expires_at != '' AND expires_at > ?");
        params.push(warningDateStr);
      }

      if (search) {
        conditions.push('(name LIKE ? OR name_en LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM medicines ${where} ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC`)
        .all(...params) as MedicineRecord[];

      return textResult({ count: rows.length, medicines: rows.map(rowToMedicine) });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to list medicines');
    }
  },
);

server.tool(
  'get_medicine',
  'Get a single medicine by its ID.',
  { id: z.number().describe('Medicine ID') },
  async ({ id }) => {
    try {
      const db = getDb();
      const row = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRecord | undefined;

      if (!row) {
        return errorResult(`Medicine with id ${id} not found`);
      }

      return textResult(rowToMedicine(row));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to get medicine');
    }
  },
);

server.tool(
  'add_medicine',
  `Add a new medicine to the medkit. Only "name" is required; all other fields are optional.
IMPORTANT: Always provide "category" when possible. Available categories: ${DEFAULT_CATEGORIES.join('、')}.
If category is omitted, the system will attempt to auto-classify based on the medicine name and usage description.
Also try to fill in name_en, spec, usage_desc, and other fields for better data quality.`,
  {
    name: z.string().trim().min(1, 'Medicine name is required').describe('Medicine name (required)'),
    name_en: z.string().optional().describe('English name'),
    spec: z.string().optional().describe('Specification, e.g. 300mg/粒'),
    quantity: z.string().optional().describe('Remaining quantity, e.g. 20粒'),
    expires_at: z.string().optional().describe('Expiry date in YYYY-MM-DD format'),
    category: z.string().optional().describe(`Category. Choose from: ${DEFAULT_CATEGORIES.join(', ')}. Or create a new reasonable category if none fits.`),
    usage_desc: z.string().optional().describe('Usage description / indications'),
    location: z.string().optional().describe('Storage location, e.g. 药箱 A层'),
    notes: z.string().optional().describe('Additional notes'),
  },
  async (params) => {
    try {
      const db = getDb();
      let category = params.category?.trim() || null;

      if (!category) {
        const inferred = inferCategory(params.name, params.usage_desc);
        if (inferred) {
          category = inferred;
        }
      }

      const result = db
        .prepare(
          `INSERT INTO medicines (name, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          params.name.trim(),
          params.name_en?.trim() || null,
          params.spec?.trim() || null,
          params.quantity?.trim() || null,
          params.expires_at?.trim() || null,
          category,
          params.usage_desc?.trim() || null,
          params.location?.trim() || null,
          params.notes?.trim() || null,
        );

      const created = db
        .prepare('SELECT * FROM medicines WHERE id = ?')
        .get(result.lastInsertRowid) as MedicineRecord;

      return textResult(rowToMedicine(created));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to add medicine');
    }
  },
);

server.tool(
  'update_medicine',
  'Update an existing medicine by ID. Only provided fields will be changed.',
  {
    id: z.number().describe('Medicine ID (required)'),
    name: z.string().optional().describe('Medicine name'),
    name_en: z.string().optional().describe('English name'),
    spec: z.string().optional().describe('Specification'),
    quantity: z.string().optional().describe('Remaining quantity'),
    expires_at: z.string().optional().describe('Expiry date in YYYY-MM-DD format'),
    category: z.string().optional().describe('Category'),
    usage_desc: z.string().optional().describe('Usage description'),
    location: z.string().optional().describe('Storage location'),
    notes: z.string().optional().describe('Additional notes'),
  },
  async ({ id, ...fields }) => {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRecord | undefined;

      if (!existing) {
        return errorResult(`Medicine with id ${id} not found`);
      }

      if (fields.name !== undefined && !fields.name.trim()) {
        return errorResult('Medicine name cannot be empty');
      }

      const setClauses: string[] = [];
      const params: (string | null | number)[] = [];

      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          setClauses.push(`${key} = ?`);
          params.push(typeof value === 'string' ? value.trim() || null : value);
        }
      }

      if (setClauses.length === 0) {
        return textResult(rowToMedicine(existing));
      }

      params.push(id);
      db.prepare(`UPDATE medicines SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

      const updated = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRecord;
      return textResult(rowToMedicine(updated));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to update medicine');
    }
  },
);

server.tool(
  'delete_medicine',
  'Delete a medicine by ID.',
  { id: z.number().describe('Medicine ID') },
  async ({ id }) => {
    try {
      const db = getDb();
      const result = db.prepare('DELETE FROM medicines WHERE id = ?').run(id);

      if (result.changes === 0) {
        return errorResult(`Medicine with id ${id} not found`);
      }

      return textResult({ deleted: true, id });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to delete medicine');
    }
  },
);

server.tool(
  'get_stats',
  'Get summary statistics of the medkit: total count, expired, expiring, ok, and category breakdown.',
  {
    expiring_days: z.number().positive().optional().describe('Days threshold for "expiring" status (default: 30)'),
  },
  async ({ expiring_days }) => {
    try {
      return textResult(computeStats(expiring_days));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to get stats');
    }
  },
);

server.tool(
  'search_medicines',
  'Search medicines by keyword across name, English name, usage description, and notes fields.',
  { query: z.string().describe('Search keyword') },
  async ({ query }) => {
    try {
      const db = getDb();
      const pattern = `%${query}%`;
      const rows = db
        .prepare(
          `SELECT * FROM medicines
           WHERE name LIKE ? OR name_en LIKE ? OR usage_desc LIKE ? OR notes LIKE ?
           ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC`,
        )
        .all(pattern, pattern, pattern, pattern) as MedicineRecord[];

      return textResult({ count: rows.length, medicines: rows.map(rowToMedicine) });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : 'Failed to search medicines');
    }
  },
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.resource(
  'medicines',
  'medkit://medicines',
  { description: 'Full list of all medicines in the medkit as JSON', mimeType: 'application/json' },
  async () => {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM medicines ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC')
      .all() as MedicineRecord[];
    return { contents: [{ uri: 'medkit://medicines', text: JSON.stringify(rows.map(rowToMedicine), null, 2) }] };
  },
);

server.resource(
  'stats',
  new ResourceTemplate('medkit://stats{?expiring_days}', { list: undefined }),
  { description: 'Summary statistics of the medkit. Use ?expiring_days=N to customize the "expiring" threshold (default: 30).', mimeType: 'application/json' },
  async (uri, params) => {
    const days = Number(params.expiring_days) || 30;
    return { contents: [{ uri: uri.href, text: JSON.stringify(computeStats(days), null, 2) }] };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MedKit MCP server running on stdio');
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
