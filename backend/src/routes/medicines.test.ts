import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { schema } from '../db/schema';

let testDb: Database.Database;

vi.mock('../db/client', () => ({
  getDb: () => testDb,
}));

import { medicinesRouter } from './medicines';

function createApp() {
  const app = new Hono();
  app.route('/api/medicines', medicinesRouter);
  return app;
}

function insertMedicine(data: Record<string, unknown>) {
  testDb
    .prepare(
      `INSERT INTO medicines (name, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.name ?? 'Test',
      data.name_en ?? null,
      data.spec ?? null,
      data.quantity ?? null,
      data.expires_at ?? null,
      data.category ?? null,
      data.usage_desc ?? null,
      data.location ?? null,
      data.notes ?? null,
    );
}

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(schema);
});

afterEach(() => {
  testDb.close();
});

describe('GET /api/medicines', () => {
  it('returns empty array when no medicines', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns all medicines', async () => {
    insertMedicine({ name: '布洛芬', category: '感冒发烧' });
    insertMedicine({ name: '创可贴', category: '外伤处理' });
    const app = createApp();
    const res = await app.request('/api/medicines');
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it('filters by category', async () => {
    insertMedicine({ name: '布洛芬', category: '感冒发烧' });
    insertMedicine({ name: '创可贴', category: '外伤处理' });
    const app = createApp();
    const res = await app.request('/api/medicines?category=感冒发烧');
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('布洛芬');
  });

  it('filters by status=expired', async () => {
    insertMedicine({ name: 'Expired', expires_at: '2020-01-01' });
    insertMedicine({ name: 'OK', expires_at: '2030-01-01' });
    const app = createApp();
    const res = await app.request('/api/medicines?status=expired');
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Expired');
  });

  it('filters by status=ok', async () => {
    insertMedicine({ name: 'OK', expires_at: '2030-01-01' });
    insertMedicine({ name: 'Expired', expires_at: '2020-01-01' });
    const app = createApp();
    const res = await app.request('/api/medicines?status=ok');
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('OK');
  });
});

describe('GET /api/medicines/stats', () => {
  it('returns zeroes when empty', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/stats');
    const body = await res.json();
    expect(body.data.total).toBe(0);
    expect(body.data.expired).toBe(0);
    expect(body.data.expiring).toBe(0);
    expect(body.data.ok).toBe(0);
    expect(body.data.categories).toEqual([]);
  });

  it('computes stats correctly', async () => {
    insertMedicine({ name: 'Expired', expires_at: '2020-01-01', category: 'A' });
    insertMedicine({ name: 'OK', expires_at: '2030-01-01', category: 'B' });
    const app = createApp();
    const res = await app.request('/api/medicines/stats');
    const body = await res.json();
    expect(body.data.total).toBe(2);
    expect(body.data.expired).toBe(1);
    expect(body.data.ok).toBe(1);
    expect(body.data.categories).toHaveLength(2);
  });
});

describe('GET /api/medicines/categories', () => {
  it('returns default categories when DB is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/categories');
    const body = await res.json();
    expect(body.data).toContain('感冒发烧');
    expect(body.data).toContain('外伤处理');
  });

  it('merges DB categories with defaults', async () => {
    insertMedicine({ name: 'X', category: '自定义分类' });
    const app = createApp();
    const res = await app.request('/api/medicines/categories');
    const body = await res.json();
    expect(body.data).toContain('自定义分类');
    expect(body.data).toContain('感冒发烧');
  });
});

describe('POST /api/medicines', () => {
  it('creates a medicine and returns 201', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '布洛芬', spec: '300mg' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe('布洛芬');
    expect(body.data.id).toBeDefined();
  });

  it('returns 400 when name is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: '300mg' }),
    });
    expect(res.status).toBe(400);
  });

  it('trims name whitespace', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  布洛芬  ' }),
    });
    const body = await res.json();
    expect(body.data.name).toBe('布洛芬');
  });
});

describe('GET /api/medicines/:id', () => {
  it('returns 404 for non-existent ID', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/999');
    expect(res.status).toBe(404);
  });

  it('returns the medicine by ID', async () => {
    insertMedicine({ name: '布洛芬' });
    const app = createApp();
    const res = await app.request('/api/medicines/1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('布洛芬');
  });
});

describe('PUT /api/medicines/:id', () => {
  it('returns 404 for non-existent ID', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    insertMedicine({ name: '布洛芬' });
    const app = createApp();
    const res = await app.request('/api/medicines/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: '500mg' }),
    });
    expect(res.status).toBe(400);
  });

  it('updates the medicine', async () => {
    insertMedicine({ name: '布洛芬' });
    const app = createApp();
    const res = await app.request('/api/medicines/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '布洛芬改' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('布洛芬改');
  });
});

describe('DELETE /api/medicines/:id', () => {
  it('returns 404 for non-existent ID', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/999', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('deletes the medicine', async () => {
    insertMedicine({ name: '布洛芬' });
    const app = createApp();
    const res = await app.request('/api/medicines/1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);

    const check = await app.request('/api/medicines/1');
    expect(check.status).toBe(404);
  });
});

describe('GET /api/medicines/export', () => {
  it('returns export JSON with correct structure', async () => {
    insertMedicine({ name: '布洛芬' });
    const app = createApp();
    const res = await app.request('/api/medicines/export');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exported_at).toBeDefined();
    expect(body.count).toBe(1);
    expect(body.medicines).toHaveLength(1);
  });

  it('sets Content-Disposition header', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/export');
    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('medkit-export-');
  });
});

describe('POST /api/medicines/import', () => {
  it('imports valid medicines', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medicines: [
          { name: '布洛芬', spec: '300mg' },
          { name: '创可贴' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(2);
    expect(body.data.skipped).toBe(0);
  });

  it('skips rows with missing name', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medicines: [{ name: '布洛芬' }, { spec: 'no name' }],
      }),
    });
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.errors).toHaveLength(1);
  });

  it('returns 400 for invalid format', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ not_medicines: [] }),
    });
    expect(res.status).toBe(400);
  });
});
