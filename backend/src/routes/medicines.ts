import { Hono } from 'hono';

import { getDb } from '../db/client';
import { DEFAULT_CATEGORIES } from '../db/schema';

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

interface MedicineInput {
  name: string;
  name_en?: string;
  spec?: string;
  quantity?: string;
  expires_at?: string;
  category?: string;
  usage_desc?: string;
  location?: string;
  notes?: string;
}

function normalizeExpiringDays(value?: string) {
  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  return 30;
}

function getDateBoundaries(expiringDays = 30) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + expiringDays);
  const warningDateStr = warningDate.toISOString().slice(0, 10);

  return { todayStr, warningDateStr };
}

function normalizeMedicineInput(input: Partial<MedicineInput>) {
  return {
    name: input.name?.trim() || '',
    name_en: input.name_en?.trim() || '',
    spec: input.spec?.trim() || '',
    quantity: input.quantity?.trim() || '',
    expires_at: input.expires_at?.trim() || '',
    category: input.category?.trim() || '',
    usage_desc: input.usage_desc?.trim() || '',
    location: input.location?.trim() || '',
    notes: input.notes?.trim() || '',
  };
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

export const medicinesRouter = new Hono();

medicinesRouter.get('/', (c) => {
  try {
    const db = getDb();
    const category = c.req.query('category');
    const status = c.req.query('status');
    const expiringDays = normalizeExpiringDays(c.req.query('expiringDays'));
    const { todayStr, warningDateStr } = getDateBoundaries(expiringDays);

    const conditions: string[] = [];
    const params: string[] = [];

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

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT * FROM medicines ${whereClause} ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC`
      )
      .all(...params) as MedicineRecord[];

    return c.json({ data: rows.map(rowToMedicine) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch medicines',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/stats', (c) => {
  try {
    const db = getDb();
    const expiringDays = normalizeExpiringDays(c.req.query('expiringDays'));
    const { todayStr, warningDateStr } = getDateBoundaries(expiringDays);

    const totals = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at < ? THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ? THEN 1 ELSE 0 END) AS expiring,
            SUM(CASE WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at > ? THEN 1 ELSE 0 END) AS ok
          FROM medicines
        `
      )
      .get(todayStr, todayStr, warningDateStr, warningDateStr) as {
      total: number;
      expired: number | null;
      expiring: number | null;
      ok: number | null;
    };

    const categories = db
      .prepare(
        `
          SELECT category, COUNT(*) AS count
          FROM medicines
          WHERE category IS NOT NULL AND category != ''
          GROUP BY category
          ORDER BY count DESC, category ASC
        `
      )
      .all() as { category: string; count: number }[];

    return c.json({
      data: {
        total: totals.total || 0,
        expired: totals.expired || 0,
        expiring: totals.expiring || 0,
        ok: totals.ok || 0,
        categories,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch stats',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/export', (c) => {
  try {
    const db = getDb();
    const medicines = db
      .prepare('SELECT * FROM medicines ORDER BY expires_at IS NULL ASC, expires_at ASC, id ASC')
      .all() as MedicineRecord[];
    const today = new Date().toISOString().slice(0, 10);

    c.header('Content-Type', 'application/json');
    c.header(
      'Content-Disposition',
      `attachment; filename=medkit-export-${today}.json`
    );

    return c.json({
      exported_at: new Date().toISOString(),
      count: medicines.length,
      medicines: medicines.map(rowToMedicine),
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to export medicines',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const importedRows = Array.isArray(body?.medicines) ? body.medicines : null;

    if (!importedRows) {
      return c.json({ error: 'Invalid import format' }, 400);
    }

    const db = getDb();
    const insert = db.prepare(
      `
        INSERT INTO medicines
        (name, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    const transaction = db.transaction((items: unknown[]) => {
      items.forEach((item, index) => {
        const normalized = normalizeMedicineInput((item || {}) as Partial<MedicineInput>);

        if (!normalized.name) {
          skipped += 1;
          errors.push(`Row ${index + 1}: missing name`);
          return;
        }

        try {
          insert.run(
            normalized.name,
            normalized.name_en || null,
            normalized.spec || null,
            normalized.quantity || null,
            normalized.expires_at || null,
            normalized.category || null,
            normalized.usage_desc || null,
            normalized.location || null,
            normalized.notes || null
          );
          imported += 1;
        } catch (error) {
          skipped += 1;
          errors.push(
            `Row ${index + 1}: ${
              error instanceof Error ? error.message : 'Unknown insert error'
            }`
          );
        }
      });
    });

    transaction(importedRows);

    return c.json({ data: { imported, skipped, errors } });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to import medicines',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/categories', (c) => {
  try {
    const db = getDb();
    const categories = db
      .prepare(
        `
          SELECT DISTINCT category
          FROM medicines
          WHERE category IS NOT NULL AND category != ''
          ORDER BY category ASC
        `
      )
      .all() as { category: string }[];

    const merged = [...DEFAULT_CATEGORIES];

    categories.forEach(({ category }) => {
      if (!merged.includes(category)) {
        merged.push(category);
      }
    });

    return c.json({ data: merged });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch categories',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.get('/:id', (c) => {
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));

    const medicine = db
      .prepare('SELECT * FROM medicines WHERE id = ?')
      .get(id) as MedicineRecord | undefined;

    if (!medicine) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    return c.json({ data: rowToMedicine(medicine) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.post('/', async (c) => {
  try {
    const db = getDb();
    const payload = normalizeMedicineInput((await c.req.json()) as Partial<MedicineInput>);

    if (!payload.name) {
      return c.json({ error: 'Medicine name is required' }, 400);
    }

    const result = db
      .prepare(
        `
          INSERT INTO medicines
          (name, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        payload.name,
        payload.name_en || null,
        payload.spec || null,
        payload.quantity || null,
        payload.expires_at || null,
        payload.category || null,
        payload.usage_desc || null,
        payload.location || null,
        payload.notes || null
      );

    const medicine = db
      .prepare('SELECT * FROM medicines WHERE id = ?')
      .get(result.lastInsertRowid) as MedicineRecord;

    return c.json({ data: rowToMedicine(medicine) }, 201);
  } catch (error) {
    return c.json(
      {
        error: 'Failed to create medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.put('/:id', async (c) => {
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const existing = db
      .prepare('SELECT id FROM medicines WHERE id = ?')
      .get(id) as { id: number } | undefined;

    if (!existing) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    const payload = normalizeMedicineInput((await c.req.json()) as Partial<MedicineInput>);

    if (!payload.name) {
      return c.json({ error: 'Medicine name is required' }, 400);
    }

    db.prepare(
      `
        UPDATE medicines
        SET name = ?, name_en = ?, spec = ?, quantity = ?, expires_at = ?, category = ?, usage_desc = ?, location = ?, notes = ?
        WHERE id = ?
      `
    ).run(
      payload.name,
      payload.name_en || null,
      payload.spec || null,
      payload.quantity || null,
      payload.expires_at || null,
      payload.category || null,
      payload.usage_desc || null,
      payload.location || null,
      payload.notes || null,
      id
    );

    const medicine = db
      .prepare('SELECT * FROM medicines WHERE id = ?')
      .get(id) as MedicineRecord;

    return c.json({ data: rowToMedicine(medicine) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to update medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

medicinesRouter.delete('/:id', (c) => {
  try {
    const db = getDb();
    const id = Number(c.req.param('id'));
    const result = db.prepare('DELETE FROM medicines WHERE id = ?').run(id);

    if (result.changes === 0) {
      return c.json({ error: 'Medicine not found' }, 404);
    }

    return c.json({ data: { deleted: true } });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete medicine',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
