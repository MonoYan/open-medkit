import { describe, expect, it } from 'vitest';

import {
  getDateBoundaries,
  getMedicineExpiryState,
  normalizeExpiringDays,
  normalizeMedicineDraftPayload,
  normalizeQueryResponseStyle,
  rowToMedicine,
  validateImageDataUrl,
} from './medicine';
import type { MedicineRecord } from './medicine';

describe('normalizeExpiringDays', () => {
  it('returns the number when positive finite', () => {
    expect(normalizeExpiringDays(15)).toBe(15);
    expect(normalizeExpiringDays('60')).toBe(60);
    expect(normalizeExpiringDays(7.9)).toBe(7);
  });

  it('returns 30 for invalid values', () => {
    expect(normalizeExpiringDays(undefined)).toBe(30);
    expect(normalizeExpiringDays(null)).toBe(30);
    expect(normalizeExpiringDays('')).toBe(30);
    expect(normalizeExpiringDays('abc')).toBe(30);
    expect(normalizeExpiringDays(0)).toBe(30);
    expect(normalizeExpiringDays(-5)).toBe(30);
    expect(normalizeExpiringDays(Infinity)).toBe(30);
    expect(normalizeExpiringDays(NaN)).toBe(30);
  });
});

describe('normalizeQueryResponseStyle', () => {
  it('returns detailed when value is "detailed"', () => {
    expect(normalizeQueryResponseStyle('detailed')).toBe('detailed');
  });

  it('returns concise for anything else', () => {
    expect(normalizeQueryResponseStyle('concise')).toBe('concise');
    expect(normalizeQueryResponseStyle(undefined)).toBe('concise');
    expect(normalizeQueryResponseStyle(42)).toBe('concise');
  });
});

describe('getDateBoundaries', () => {
  it('returns todayStr and in30daysStr with default 30 days', () => {
    const { todayStr, in30daysStr } = getDateBoundaries();
    expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(in30daysStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(in30daysStr) > new Date(todayStr)).toBe(true);
  });

  it('respects custom expiring days', () => {
    const { todayStr, in30daysStr } = getDateBoundaries(7);
    const daysDiff =
      (new Date(in30daysStr).getTime() - new Date(todayStr).getTime()) /
      (1000 * 60 * 60 * 24);
    expect(Math.round(daysDiff)).toBe(7);
  });
});

describe('getMedicineExpiryState', () => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const pastDate = new Date(today);
  pastDate.setDate(pastDate.getDate() - 10);
  const pastStr = pastDate.toISOString().slice(0, 10);

  const soonDate = new Date(today);
  soonDate.setDate(soonDate.getDate() + 15);
  const soonStr = soonDate.toISOString().slice(0, 10);

  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + 60);
  const futureStr = futureDate.toISOString().slice(0, 10);

  const { in30daysStr } = getDateBoundaries(30);

  it('returns "expired" when expires_at is in the past', () => {
    const med = { expires_at: pastStr } as any;
    expect(getMedicineExpiryState(med, todayStr, in30daysStr)).toBe('expired');
  });

  it('returns "expiring" when within 30 days', () => {
    const med = { expires_at: soonStr } as any;
    expect(getMedicineExpiryState(med, todayStr, in30daysStr)).toBe('expiring');
  });

  it('returns "ok" when far in the future', () => {
    const med = { expires_at: futureStr } as any;
    expect(getMedicineExpiryState(med, todayStr, in30daysStr)).toBe('ok');
  });

  it('returns "unknown" when no expires_at', () => {
    const med = { expires_at: '' } as any;
    expect(getMedicineExpiryState(med, todayStr, in30daysStr)).toBe('unknown');
  });
});

describe('normalizeMedicineDraftPayload', () => {
  it('extracts string fields from parsed object', () => {
    const result = normalizeMedicineDraftPayload({
      name: '布洛芬',
      name_en: 'Ibuprofen',
      spec: '300mg',
      quantity: '20粒',
      expires_at: '2027-06-30',
      category: '感冒发烧',
      usage_desc: '退烧止痛',
      location: '药箱A层',
      notes: '',
    });

    expect(result).toEqual({
      name: '布洛芬',
      name_en: 'Ibuprofen',
      spec: '300mg',
      quantity: '20粒',
      expires_at: '2027-06-30',
      category: '感冒发烧',
      usage_desc: '退烧止痛',
      location: '药箱A层',
      notes: '',
    });
  });

  it('defaults non-string values to empty string', () => {
    const result = normalizeMedicineDraftPayload({
      name: 123,
      spec: null,
      unknown_field: 'ignored',
    });

    expect(result.name).toBe('');
    expect(result.spec).toBe('');
    expect(result).not.toHaveProperty('unknown_field');
  });

  it('handles empty object', () => {
    const result = normalizeMedicineDraftPayload({});
    expect(result.name).toBe('');
    expect(result.name_en).toBe('');
  });
});

describe('validateImageDataUrl', () => {
  it('accepts valid image data URLs', () => {
    const jpegUrl = 'data:image/jpeg;base64,/9j/4AAQSk...';
    const result = validateImageDataUrl(jpegUrl);
    expect(result).toEqual({ mimeType: 'image/jpeg', dataUrl: jpegUrl });
  });

  it('accepts png', () => {
    const pngUrl = 'data:image/png;base64,iVBOR...';
    expect(validateImageDataUrl(pngUrl)).not.toBeNull();
  });

  it('accepts webp', () => {
    const webpUrl = 'data:image/webp;base64,UklGR...';
    expect(validateImageDataUrl(webpUrl)).not.toBeNull();
  });

  it('rejects non-string input', () => {
    expect(validateImageDataUrl(null)).toBeNull();
    expect(validateImageDataUrl(undefined)).toBeNull();
    expect(validateImageDataUrl(42)).toBeNull();
  });

  it('rejects non-image data URLs', () => {
    expect(validateImageDataUrl('data:text/plain;base64,abc')).toBeNull();
    expect(validateImageDataUrl('https://example.com/img.png')).toBeNull();
    expect(validateImageDataUrl('not a data url')).toBeNull();
  });
});

describe('rowToMedicine', () => {
  it('converts null fields to empty strings', () => {
    const row: MedicineRecord = {
      id: 1,
      name: 'Test',
      name_en: null,
      spec: null,
      quantity: null,
      expires_at: null,
      category: null,
      usage_desc: null,
      location: null,
      notes: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const result = rowToMedicine(row);
    expect(result.name_en).toBe('');
    expect(result.spec).toBe('');
    expect(result.quantity).toBe('');
    expect(result.expires_at).toBe('');
    expect(result.category).toBe('');
    expect(result.usage_desc).toBe('');
    expect(result.location).toBe('');
    expect(result.notes).toBe('');
    expect(result.id).toBe(1);
    expect(result.name).toBe('Test');
  });

  it('preserves non-null field values', () => {
    const row: MedicineRecord = {
      id: 2,
      name: '布洛芬',
      name_en: 'Ibuprofen',
      spec: '300mg',
      quantity: '20粒',
      expires_at: '2027-06-30',
      category: '感冒发烧',
      usage_desc: '退烧',
      location: 'A层',
      notes: '备注',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const result = rowToMedicine(row);
    expect(result.name_en).toBe('Ibuprofen');
    expect(result.spec).toBe('300mg');
  });
});
