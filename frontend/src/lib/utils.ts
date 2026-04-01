import type { MedicineStatus } from '../types';

const DAY_IN_MS = 86_400_000;

function parseDateInput(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function getTodayStr(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year || '1970'}-${values.month || '01'}-${values.day || '01'}`;
}

function dateStrToUtcMs(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Date.UTC(year, (month || 1) - 1, day || 1);
}

function addDays(dateStr: string, days: number) {
  const result = new Date(dateStrToUtcMs(dateStr) + days * DAY_IN_MS);

  return [
    String(result.getUTCFullYear()).padStart(4, '0'),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function getMedicineStatus(
  expiresAt?: string,
  timezone = 'UTC',
  expiringDays = 30,
): MedicineStatus {
  if (!expiresAt) {
    return 'unknown';
  }

  const todayStr = getTodayStr(timezone);
  const warningDateStr = addDays(todayStr, expiringDays);

  if (expiresAt < todayStr) {
    return 'expired';
  }

  if (expiresAt <= warningDateStr) {
    return 'expiring';
  }

  return 'ok';
}

export function formatDate(dateStr?: string) {
  if (!dateStr) {
    return '未填写';
  }

  const date = parseDateInput(dateStr);

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function daysUntilExpiry(expiresAt: string, timezone = 'UTC') {
  const diff = dateStrToUtcMs(expiresAt) - dateStrToUtcMs(getTodayStr(timezone));

  return Math.round(diff / DAY_IN_MS);
}

export function getStatusText(status: MedicineStatus, days?: number) {
  if (status === 'expired') {
    return '已过期';
  }

  if (status === 'expiring') {
    if (typeof days === 'number') {
      if (days <= 0) {
        return '今天到期';
      }

      return `${days}天后到期`;
    }

    return '即将到期';
  }

  if (status === 'ok') {
    return '未临期';
  }

  return '未知';
}

export function compressImage(
  file: File,
  maxSize = 1024,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
