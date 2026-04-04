import { Hono } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

import { isAuthEnabled, verifyPassword } from '../auth/password';
import {
  checkRateLimit,
  createSession,
  recordFailure,
  removeSession,
  resetLimit,
  validateSession,
} from '../auth/session';

export const authRouter = new Hono();

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}

function buildSetCookie(token: string, maxAge: number, isSecure: boolean): string {
  const parts = [
    `medkit_session=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isSecure) parts.push('Secure');
  return parts.join('; ');
}

function detectSecure(c: { req: { header: (name: string) => string | undefined; url: string } }): boolean {
  if (c.req.header('x-forwarded-proto') === 'https') return true;
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function getRateLimitKey(c: Parameters<typeof getConnInfo>[0]): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address || 'unknown';
  } catch {
    return 'unknown';
  }
}

authRouter.get('/status', (c) => {
  const requiresAuth = isAuthEnabled();
  let authenticated = false;

  if (requiresAuth) {
    const token = parseCookie(c.req.header('cookie'), 'medkit_session');
    authenticated = !!token && validateSession(token);
  }

  c.header('Cache-Control', 'no-store');
  return c.json({ requiresAuth, authenticated });
});

authRouter.post('/login', async (c) => {
  if (!isAuthEnabled()) {
    return c.json({ error: 'Authentication is not enabled' }, 400);
  }

  const rateLimitKey = getRateLimitKey(c);
  const limit = checkRateLimit(rateLimitKey);

  if (!limit.allowed) {
    const retryAfterSec = Math.ceil((limit.retryAfterMs || 0) / 1000);
    c.header('Retry-After', String(retryAfterSec));
    return c.json({ error: '登录尝试过多，请稍后重试' }, 429);
  }

  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const password = body.password;
  if (typeof password !== 'string' || !password) {
    return c.json({ error: 'Password is required' }, 400);
  }

  const valid = await verifyPassword(password);

  if (!valid) {
    recordFailure(rateLimitKey);
    return c.json({ error: '密码错误' }, 401);
  }

  resetLimit(rateLimitKey);

  const token = createSession();
  const isSecure = detectSecure(c);
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds

  c.header('Set-Cookie', buildSetCookie(token, maxAge, isSecure));
  return c.json({ success: true });
});

authRouter.post('/logout', (c) => {
  const token = parseCookie(c.req.header('cookie'), 'medkit_session');

  if (token) {
    removeSession(token);
  }

  const isSecure = detectSecure(c);
  c.header('Set-Cookie', buildSetCookie('', 0, isSecure));
  return c.json({ success: true });
});
