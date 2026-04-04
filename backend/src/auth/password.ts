import crypto from 'node:crypto';
import argon2 from 'argon2';

export interface AuthConfig {
  mode: 'hash' | 'plaintext' | 'disabled';
  hash?: string;
  plaintext?: string;
}

export function getAuthConfig(): AuthConfig {
  const hash = process.env.AUTH_PASSWORD_HASH?.trim();
  const plaintext = process.env.AUTH_PASSWORD?.trim();

  if (hash) {
    return { mode: 'hash', hash };
  }

  if (plaintext) {
    return { mode: 'plaintext', plaintext };
  }

  return { mode: 'disabled' };
}

export function isAuthEnabled(): boolean {
  return getAuthConfig().mode !== 'disabled';
}

function safeCompare(input: string, expected: string): boolean {
  const inputBuf = Buffer.from(input, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');

  if (inputBuf.length !== expectedBuf.length) {
    const dummy = Buffer.alloc(expectedBuf.length);
    crypto.timingSafeEqual(dummy, expectedBuf);
    return false;
  }

  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const config = getAuthConfig();

  if (config.mode === 'disabled') {
    return false;
  }

  if (config.mode === 'hash') {
    try {
      return await argon2.verify(config.hash!, password);
    } catch {
      return false;
    }
  }

  return safeCompare(password, config.plaintext!);
}

export function logAuthMode(): void {
  const config = getAuthConfig();

  switch (config.mode) {
    case 'hash':
      console.log('[auth] Enabled (argon2id hash)');
      break;
    case 'plaintext':
      console.log(
        '[auth] Enabled (plaintext) — WARNING: use AUTH_PASSWORD_HASH for better security',
      );
      break;
    case 'disabled':
      console.log('[auth] Disabled — all routes are public');
      break;
  }
}
