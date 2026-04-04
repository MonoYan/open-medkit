import crypto from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface SessionEntry {
  expiresAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const sessions = new Map<string, SessionEntry>();
const rateLimits = new Map<string, RateLimitEntry>();

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export function createSession(): string {
  const token = crypto.randomUUID();
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function validateSession(token: string): boolean {
  const entry = sessions.get(token);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function removeSession(token: string): void {
  sessions.delete(token);
}

export function startSessionCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of sessions) {
      if (now > entry.expiresAt) {
        sessions.delete(token);
      }
    }
    for (const [key, entry] of rateLimits) {
      if (now > entry.resetAt) {
        rateLimits.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref();
}

// ---------------------------------------------------------------------------
// Login rate limiting
// ---------------------------------------------------------------------------

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const entry = rateLimits.get(key);
  if (!entry) return { allowed: true };

  if (Date.now() > entry.resetAt) {
    rateLimits.delete(key);
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - Date.now() };
  }

  return { allowed: true };
}

export function recordFailure(key: string): void {
  const existing = rateLimits.get(key);
  if (existing && Date.now() <= existing.resetAt) {
    existing.count += 1;
  } else {
    rateLimits.set(key, {
      count: 1,
      resetAt: Date.now() + RATE_LIMIT_WINDOW_MS,
    });
  }
}

export function resetLimit(key: string): void {
  rateLimits.delete(key);
}
