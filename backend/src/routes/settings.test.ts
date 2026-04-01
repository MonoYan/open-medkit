import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { schema } from '../db/schema';

let testDb: Database.Database;

vi.mock('../db/client', () => ({
  getDb: () => testDb,
}));

import { settingsRouter } from './settings';

function createApp() {
  const app = new Hono();
  app.route('/api/settings', settingsRouter);
  return app;
}

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.exec(schema);
});

afterEach(() => {
  testDb.close();
});

describe('GET /api/settings', () => {
  it('returns UTC fallback when timezone is not configured', async () => {
    const app = createApp();
    const res = await app.request('/api/settings');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ timezone: 'UTC', configured: false });
  });
});

describe('PUT /api/settings/timezone', () => {
  it('stores a canonical timezone and marks it configured', async () => {
    const app = createApp();
    const res = await app.request('/api/settings/timezone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: 'Asia/Shanghai' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ timezone: 'Asia/Shanghai', configured: true });
  });

  it('clears last_notified_date when timezone changes', async () => {
    testDb
      .prepare(
        `INSERT INTO notification_channels (channel_type, enabled, config, notify_hour, last_notified_date)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('telegram', 1, '{}', 9, '2026-04-03');

    const app = createApp();
    const res = await app.request('/api/settings/timezone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: 'Asia/Shanghai' }),
    });

    expect(res.status).toBe(200);
    const row = testDb
      .prepare('SELECT last_notified_date FROM notification_channels WHERE channel_type = ?')
      .get('telegram') as { last_notified_date: string | null };
    expect(row.last_notified_date).toBeNull();
  });

  it('rejects invalid timezones', async () => {
    const app = createApp();
    const res = await app.request('/api/settings/timezone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: 'Mars/Base' }),
    });

    expect(res.status).toBe(400);
  });
});
