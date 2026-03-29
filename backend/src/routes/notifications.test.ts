import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { schema } from '../db/schema';

let testDb: Database.Database;

vi.mock('../db/client', () => ({
  getDb: () => testDb,
}));

vi.mock('../services/telegram', () => ({
  getMe: vi.fn().mockResolvedValue({ id: 123, username: 'test_bot' }),
  sendMessage: vi.fn().mockResolvedValue(undefined),
  waitForStart: vi.fn().mockResolvedValue(null),
  getUpdates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/notifier', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/notifier')>();
  return {
    ...original,
    sendNotificationNow: vi.fn().mockResolvedValue('测试通知已发送'),
  };
});

import { notificationsRouter } from './notifications';

function createApp() {
  const app = new Hono();
  app.route('/api/notifications', notificationsRouter);
  return app;
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

describe('GET /api/notifications/channels', () => {
  it('returns empty array when no channels', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns channels with masked bot token', async () => {
    testDb
      .prepare(
        `INSERT INTO notification_channels (channel_type, enabled, config, notify_hour)
         VALUES (?, ?, ?, ?)`,
      )
      .run('telegram', 1, JSON.stringify({ botToken: '1234567890:ABCDEFghijklmno' }), 9);

    const app = createApp();
    const res = await app.request('/api/notifications/channels');
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].channel_type).toBe('telegram');
    expect(body.data[0].enabled).toBe(true);
    expect(body.data[0].config.botToken).not.toBe('1234567890:ABCDEFghijklmno');
    expect(body.data[0].config.botToken).toContain('...');
  });
});

describe('PUT /api/notifications/channels/:type', () => {
  it('creates a new channel', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        config: { botToken: 'token123' },
        notify_hour: 10,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.channel_type).toBe('telegram');
    expect(body.data.enabled).toBe(true);
    expect(body.data.notify_hour).toBe(10);
  });

  it('updates an existing channel', async () => {
    testDb
      .prepare(
        `INSERT INTO notification_channels (channel_type, enabled, config, notify_hour)
         VALUES (?, ?, ?, ?)`,
      )
      .run('telegram', 0, JSON.stringify({ botToken: 'old' }), 9);

    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, notify_hour: 20 }),
    });
    const body = await res.json();
    expect(body.data.enabled).toBe(true);
    expect(body.data.notify_hour).toBe(20);
  });

  it('clamps notify_hour to 0-23', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, config: { botToken: 't' }, notify_hour: 30 }),
    });
    const body = await res.json();
    expect(body.data.notify_hour).toBe(23);
  });
});

describe('DELETE /api/notifications/channels/:type', () => {
  it('returns 404 for non-existent channel', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('deletes an existing channel', async () => {
    testDb
      .prepare(
        `INSERT INTO notification_channels (channel_type, enabled, config)
         VALUES (?, ?, ?)`,
      )
      .run('telegram', 1, '{}');

    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
  });
});

describe('POST /api/notifications/channels/telegram/verify', () => {
  it('returns 400 when botToken is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns bot username on success', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'valid-token' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.botUsername).toBe('test_bot');
  });
});

describe('POST /api/notifications/channels/:type/test', () => {
  it('returns success message', async () => {
    const app = createApp();
    const res = await app.request('/api/notifications/channels/telegram/test', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBeDefined();
  });
});
