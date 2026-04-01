import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { daysUntilExpiry, formatDate, getMedicineStatus, getStatusText } from './utils';

const timezone = 'Asia/Shanghai';

describe('getMedicineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "unknown" when no date provided', () => {
    expect(getMedicineStatus(undefined, timezone)).toBe('unknown');
    expect(getMedicineStatus('', timezone)).toBe('unknown');
  });

  it('returns "expired" for past dates', () => {
    expect(getMedicineStatus('2026-04-02', timezone)).toBe('expired');
  });

  it('returns "expiring" for dates within 30 days', () => {
    expect(getMedicineStatus('2026-04-18', timezone)).toBe('expiring');
  });

  it('returns "ok" for dates far in the future', () => {
    expect(getMedicineStatus('2026-07-02', timezone)).toBe('ok');
  });

  it('respects custom expiringDays parameter', () => {
    expect(getMedicineStatus('2026-04-13', timezone, 7)).toBe('ok');
    expect(getMedicineStatus('2026-04-13', timezone, 15)).toBe('expiring');
  });

  it('returns "expiring" when expires_at equals today', () => {
    expect(getMedicineStatus('2026-04-03', timezone)).toBe('expiring');
  });
});

describe('formatDate', () => {
  it('returns "未填写" for empty input', () => {
    expect(formatDate(undefined)).toBe('未填写');
    expect(formatDate('')).toBe('未填写');
  });

  it('formats a date in Chinese locale', () => {
    const result = formatDate('2026-04-22');
    expect(result).toContain('2026');
    expect(result).toContain('4');
    expect(result).toContain('22');
  });
});

describe('daysUntilExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns positive number for future dates', () => {
    expect(daysUntilExpiry('2026-04-13', timezone)).toBe(10);
  });

  it('returns negative number for past dates', () => {
    expect(daysUntilExpiry('2026-03-29', timezone)).toBe(-5);
  });

  it('returns 0 for today', () => {
    expect(daysUntilExpiry('2026-04-03', timezone)).toBe(0);
  });
});

describe('getStatusText', () => {
  it('returns "已过期" for expired status', () => {
    expect(getStatusText('expired')).toBe('已过期');
  });

  it('returns "今天到期" for expiring with 0 days', () => {
    expect(getStatusText('expiring', 0)).toBe('今天到期');
  });

  it('returns "N天后到期" for expiring with positive days', () => {
    expect(getStatusText('expiring', 5)).toBe('5天后到期');
  });

  it('returns "即将到期" for expiring without days', () => {
    expect(getStatusText('expiring')).toBe('即将到期');
  });

  it('returns "未临期" for ok status', () => {
    expect(getStatusText('ok')).toBe('未临期');
  });

  it('returns "未知" for unknown status', () => {
    expect(getStatusText('unknown')).toBe('未知');
  });
});
