import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { schema } from '../db/schema';

let testDb: Database.Database;

vi.mock('../db/client', () => ({
  getDb: () => testDb,
}));

vi.mock('../ai/client', () => ({
  buildChatCompletionsUrl: vi.fn((url: string) => `${url}/v1/chat/completions`),
  callAiJson: vi.fn().mockResolvedValue({
    parsed: { name: '布洛芬', spec: '300mg', category: '感冒发烧' },
    raw: '{"name":"布洛芬"}',
  }),
  callAiText: vi.fn().mockResolvedValue(
    '你可以使用布洛芬。\n[[MEDKIT_IDS:1]]',
  ),
  fetchStream: vi.fn(),
  getContentText: vi.fn(),
  getStreamChunkText: vi.fn(),
  readAiErrorDetail: vi.fn(),
}));

import { aiRouter } from './ai';

function createApp() {
  const app = new Hono();
  app.route('/api/ai', aiRouter);
  return app;
}

const AI_HEADERS = {
  'Content-Type': 'application/json',
  'X-AI-Api-Key': 'test-key',
  'X-AI-Base-Url': 'https://test.api',
  'X-AI-Model': 'test-model',
};

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(schema);
});

afterEach(() => {
  testDb.close();
});

describe('GET /api/ai/config-status', () => {
  it('returns config status without requiring API key', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/config-status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('hasServerAiConfig');
    expect(body.data).toHaveProperty('defaultBaseUrl');
    expect(body.data).toHaveProperty('defaultModel');
  });
});

describe('POST /api/ai/parse', () => {
  it('returns 400 when no API key provided', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '布洛芬' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when text is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('parses medicine text successfully', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '布洛芬缓释胶囊300mg' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe('布洛芬');
  });
});

describe('POST /api/ai/parse-batch', () => {
  it('returns 400 when text is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse-batch', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when exceeding 20 items', async () => {
    const items = Array.from({ length: 21 }, (_, i) => `item${i}`).join('\n');
    const app = createApp();
    const res = await app.request('/api/ai/parse-batch', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: items }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('max 20');
  });

  it('parses multiple items', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse-batch', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ text: '布洛芬300mg\n创可贴' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(2);
    expect(body.data.results[0].success).toBe(true);
  });
});

describe('POST /api/ai/query', () => {
  it('returns 400 when question is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns empty-box response when no medicines exist', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '有没有退烧药' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('空的');
    expect(body.data.medicines).toEqual([]);
  });

  it('returns inventory answer for inventory questions', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, expires_at, category) VALUES (?, ?, ?)`,
      )
      .run('布洛芬', '2028-01-01', '感冒发烧');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '家里都有什么药' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.answer).toContain('药箱概况');
  });

  it('calls AI for non-inventory questions with medicines in DB', async () => {
    testDb
      .prepare(
        `INSERT INTO medicines (name, expires_at, category) VALUES (?, ?, ?)`,
      )
      .run('布洛芬', '2028-01-01', '感冒发烧');

    const app = createApp();
    const res = await app.request('/api/ai/query', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ question: '有没有退烧药' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});

describe('POST /api/ai/complete', () => {
  it('returns 400 when draft is empty', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/complete', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ draft: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('completes a draft with existing content', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/complete', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ draft: { name: '布洛芬' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
  });
});

describe('POST /api/ai/test', () => {
  it('returns success on valid AI response', async () => {
    const { callAiJson } = await import('../ai/client');
    (callAiJson as any).mockResolvedValueOnce({
      parsed: { ok: true, message: '连接成功' },
      raw: '{"ok":true,"message":"连接成功"}',
    });

    const app = createApp();
    const res = await app.request('/api/ai/test', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
  });
});

describe('POST /api/ai/parse-image', () => {
  it('returns 400 for invalid image data URL', async () => {
    const app = createApp();
    const res = await app.request('/api/ai/parse-image', {
      method: 'POST',
      headers: AI_HEADERS,
      body: JSON.stringify({ image: 'not a data url' }),
    });
    expect(res.status).toBe(400);
  });
});
