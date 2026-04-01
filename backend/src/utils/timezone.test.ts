import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { schema } from '../db/schema';
import {
  addDays,
  canonicalizeTimezone,
  getCurrentHour,
  getDateBoundaries,
  getStoredTimezone,
  getTodayStr,
  setStoredTimezone,
} from './timezone';

describe('timezone helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T16:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('canonicalizes valid timezones', () => {
    expect(canonicalizeTimezone('Asia/Shanghai')).toBe('Asia/Shanghai');
    expect(canonicalizeTimezone('UTC')).toBe('UTC');
  });

  it('returns null for invalid timezones', () => {
    expect(canonicalizeTimezone('Mars/Base')).toBeNull();
  });

  it('formats today in the requested timezone', () => {
    expect(getTodayStr('Asia/Shanghai')).toBe('2026-04-03');
    expect(getTodayStr('UTC')).toBe('2026-04-02');
  });

  it('adds days using pure UTC date math', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('gets the current hour in the requested timezone', () => {
    expect(getCurrentHour('UTC')).toBe(16);
    expect(getCurrentHour('Asia/Shanghai')).toBe(0);
  });

  it('computes date boundaries with timezone-aware today', () => {
    expect(getDateBoundaries('Asia/Shanghai', 7)).toEqual({
      todayStr: '2026-04-03',
      warningDateStr: '2026-04-10',
    });
  });
});

describe('stored timezone settings', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(schema);
  });

  afterEach(() => {
    db.close();
  });

  it('falls back to UTC when no timezone is configured', () => {
    expect(getStoredTimezone(db)).toEqual({ timezone: 'UTC', configured: false });
  });

  it('returns a configured timezone when present', () => {
    setStoredTimezone(db, 'Asia/Shanghai');
    expect(getStoredTimezone(db)).toEqual({ timezone: 'Asia/Shanghai', configured: true });
  });

  it('falls back safely when the stored timezone is invalid', () => {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('timezone', 'Mars/Base')").run();
    expect(getStoredTimezone(db)).toEqual({ timezone: 'UTC', configured: false });
  });
});
