import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AiEnv, apiKeyMiddleware } from './apiKey';

function createApp() {
  const app = new Hono<AiEnv>();
  app.use('*', apiKeyMiddleware);
  app.get('/test', (c) =>
    c.json({
      aiApiKey: c.get('aiApiKey'),
      aiBaseUrl: c.get('aiBaseUrl'),
      aiModel: c.get('aiModel'),
    }),
  );
  return app;
}

describe('apiKeyMiddleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 400 when no API key from env or header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No API key');
  });

  it('reads API key from env var', async () => {
    process.env.AI_API_KEY = 'env-key';
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiApiKey).toBe('env-key');
  });

  it('reads API key from header when env is not set', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-AI-Api-Key': 'header-key' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aiApiKey).toBe('header-key');
  });

  it('env var takes priority over header', async () => {
    process.env.AI_API_KEY = 'env-key';
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-AI-Api-Key': 'header-key' },
    });
    const body = await res.json();
    expect(body.aiApiKey).toBe('env-key');
  });

  it('uses default base URL when neither env nor header is set', async () => {
    process.env.AI_API_KEY = 'key';
    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();
    expect(body.aiBaseUrl).toBe('https://api.openai.com');
  });

  it('reads base URL from env', async () => {
    process.env.AI_API_KEY = 'key';
    process.env.AI_BASE_URL = 'https://custom.api';
    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();
    expect(body.aiBaseUrl).toBe('https://custom.api');
  });

  it('reads base URL from header when env is not set', async () => {
    process.env.AI_API_KEY = 'key';
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-AI-Base-Url': 'https://header.api' },
    });
    const body = await res.json();
    expect(body.aiBaseUrl).toBe('https://header.api');
  });

  it('uses default model when neither env nor header is set', async () => {
    process.env.AI_API_KEY = 'key';
    const app = createApp();
    const res = await app.request('/test');
    const body = await res.json();
    expect(body.aiModel).toBe('gpt-4o-mini');
  });

  it('reads model from header', async () => {
    process.env.AI_API_KEY = 'key';
    const app = createApp();
    const res = await app.request('/test', {
      headers: { 'X-AI-Model': 'claude-3' },
    });
    const body = await res.json();
    expect(body.aiModel).toBe('claude-3');
  });
});
