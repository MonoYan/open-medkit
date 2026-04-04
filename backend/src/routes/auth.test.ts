import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';

import { authRouter } from './auth';
import { authMiddleware } from '../middleware/auth';

function createApp() {
  const app = new Hono();
  app.route('/api/auth', authRouter);
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.use('/api/*', authMiddleware);
  app.get('/api/medicines', (c) => c.json({ data: [] }));
  return app;
}

function getCookie(res: Response): string | undefined {
  const header = res.headers.get('set-cookie');
  if (!header) return undefined;
  const match = header.match(/medkit_session=([^;]*)/);
  return match?.[1];
}

let originalHash: string | undefined;
let originalPlain: string | undefined;

beforeEach(() => {
  originalHash = process.env.AUTH_PASSWORD_HASH;
  originalPlain = process.env.AUTH_PASSWORD;
  delete process.env.AUTH_PASSWORD_HASH;
  delete process.env.AUTH_PASSWORD;
});

afterEach(() => {
  if (originalHash !== undefined) process.env.AUTH_PASSWORD_HASH = originalHash;
  else delete process.env.AUTH_PASSWORD_HASH;
  if (originalPlain !== undefined) process.env.AUTH_PASSWORD = originalPlain;
  else delete process.env.AUTH_PASSWORD;
});

describe('auth disabled (no password)', () => {
  it('GET /api/auth/status returns requiresAuth: false', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresAuth).toBe(false);
    expect(body.authenticated).toBe(false);
  });

  it('GET /api/auth/status has Cache-Control: no-store', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/status');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('protected route accessible without cookie', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines');
    expect(res.status).toBe(200);
  });

  it('POST /api/auth/login returns 400 when auth disabled', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/health always returns 200', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

describe('auth enabled (plaintext)', () => {
  beforeEach(() => {
    process.env.AUTH_PASSWORD = 'testpass123';
  });

  it('GET /api/auth/status returns requiresAuth: true', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/status');
    const body = await res.json();
    expect(body.requiresAuth).toBe(true);
    expect(body.authenticated).toBe(false);
  });

  it('protected route returns 401 without cookie', async () => {
    const app = createApp();
    const res = await app.request('/api/medicines');
    expect(res.status).toBe(401);
  });

  it('GET /api/health returns 200 even when auth enabled', async () => {
    const app = createApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('login with correct password succeeds', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpass123' }),
    });
    expect(res.status).toBe(200);
    const cookie = getCookie(res);
    expect(cookie).toBeTruthy();
    expect(cookie).not.toBe('');
  });

  it('login with wrong password returns 401', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('authenticated request succeeds with session cookie', async () => {
    const app = createApp();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpass123' }),
    });
    const cookie = getCookie(loginRes);

    const res = await app.request('/api/medicines', {
      headers: { Cookie: `medkit_session=${cookie}` },
    });
    expect(res.status).toBe(200);
  });

  it('status shows authenticated with valid cookie', async () => {
    const app = createApp();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpass123' }),
    });
    const cookie = getCookie(loginRes);

    const res = await app.request('/api/auth/status', {
      headers: { Cookie: `medkit_session=${cookie}` },
    });
    const body = await res.json();
    expect(body.authenticated).toBe(true);
  });

  it('logout clears session', async () => {
    const app = createApp();
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'testpass123' }),
    });
    const cookie = getCookie(loginRes);

    await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: `medkit_session=${cookie}` },
    });

    const res = await app.request('/api/medicines', {
      headers: { Cookie: `medkit_session=${cookie}` },
    });
    expect(res.status).toBe(401);
  });

  it('login with empty password returns 400', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('auth enabled (argon2 hash)', () => {
  let hash: string;

  beforeEach(async () => {
    hash = await argon2.hash('securepass', { type: argon2.argon2id });
    process.env.AUTH_PASSWORD_HASH = hash;
  });

  it('login with correct password succeeds', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'securepass' }),
    });
    expect(res.status).toBe(200);
    expect(getCookie(res)).toBeTruthy();
  });

  it('login with wrong password returns 401', async () => {
    const app = createApp();
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpass' }),
    });
    expect(res.status).toBe(401);
  });

  it('hash takes priority over plaintext', async () => {
    process.env.AUTH_PASSWORD = 'plaintextpass';
    const app = createApp();

    const wrongRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'plaintextpass' }),
    });
    expect(wrongRes.status).toBe(401);

    const rightRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'securepass' }),
    });
    expect(rightRes.status).toBe(200);
  });
});

describe('rate limiting', () => {
  beforeEach(() => {
    process.env.AUTH_PASSWORD = 'testpass';
  });

  it('returns 429 after too many failed attempts', async () => {
    const app = createApp();

    for (let i = 0; i < 5; i++) {
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong' }),
      });
    }

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});
