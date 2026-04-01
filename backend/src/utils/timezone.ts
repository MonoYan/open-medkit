import type { SqliteDatabase } from '../db/client';

const DEFAULT_TIMEZONE = 'UTC';
const DAY_IN_MS = 86_400_000;

interface DateParts {
  year: string;
  month: string;
  day: string;
}

function getDateParts(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    year: values.year || '1970',
    month: values.month || '01',
    day: values.day || '01',
  };
}

export function canonicalizeTimezone(timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function formatDateInTimezone(date: Date, timezone: string) {
  const { year, month, day } = getDateParts(date, timezone);
  return `${year}-${month}-${day}`;
}

export function getTodayStr(timezone: string) {
  return formatDateInTimezone(new Date(), timezone);
}

export function addDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(year, month - 1, day) + days * DAY_IN_MS;
  const result = new Date(utcMs);

  return [
    String(result.getUTCFullYear()).padStart(4, '0'),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getCurrentHour(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === 'hour');

  return hourPart ? Number(hourPart.value) % 24 : 0;
}

export function getDateBoundaries(timezone: string, expiringDays = 30) {
  const todayStr = getTodayStr(timezone);
  const warningDateStr = addDays(todayStr, expiringDays);

  return { todayStr, warningDateStr };
}

export function getStoredTimezone(db: SqliteDatabase): { timezone: string; configured: boolean } {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'timezone'")
    .get() as { value: string } | undefined;

  if (!row) {
    return { timezone: DEFAULT_TIMEZONE, configured: false };
  }

  const canonicalTimezone = canonicalizeTimezone(row.value);

  if (!canonicalTimezone) {
    return { timezone: DEFAULT_TIMEZONE, configured: false };
  }

  return { timezone: canonicalTimezone, configured: true };
}

export function setStoredTimezone(db: SqliteDatabase, timezone: string) {
  db.prepare(
    `
      INSERT INTO app_settings (key, value)
      VALUES ('timezone', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
  ).run(timezone);
}
