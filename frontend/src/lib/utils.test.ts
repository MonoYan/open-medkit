import { describe, expect, it, vi } from 'vitest';

import { daysUntilExpiry, formatDate, getMedicineStatus, getStatusText } from './utils';

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function offsetDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('getMedicineStatus', () => {
  it('returns "unknown" when no date provided', () => {
    expect(getMedicineStatus(undefined)).toBe('unknown');
    expect(getMedicineStatus('')).toBe('unknown');
  });

  it('returns "expired" for past dates', () => {
    expect(getMedicineStatus('2020-01-01')).toBe('expired');
  });

  it('returns "expiring" for dates within 30 days', () => {
    const soon = offsetDate(15);
    expect(getMedicineStatus(soon)).toBe('expiring');
  });

  it('returns "ok" for dates far in the future', () => {
    const future = offsetDate(90);
    expect(getMedicineStatus(future)).toBe('ok');
  });

  it('respects custom expiringDays parameter', () => {
    const in10days = offsetDate(10);
    expect(getMedicineStatus(in10days, 7)).toBe('ok');
    expect(getMedicineStatus(in10days, 15)).toBe('expiring');
  });

  it('returns "expiring" when expires_at equals today', () => {
    const today = todayStr();
    expect(getMedicineStatus(today)).toBe('expiring');
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
  it('returns positive number for future dates', () => {
    const future = offsetDate(10);
    expect(daysUntilExpiry(future)).toBe(10);
  });

  it('returns negative number for past dates', () => {
    const past = offsetDate(-5);
    expect(daysUntilExpiry(past)).toBe(-5);
  });

  it('returns 0 for today', () => {
    const today = todayStr();
    expect(daysUntilExpiry(today)).toBe(0);
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
