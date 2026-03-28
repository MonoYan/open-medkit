import type { MedicineStatus } from '../types';

function parseDateInput(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

export function getMedicineStatus(
  expiresAt?: string,
  expiringDays = 30,
): MedicineStatus {
  if (!expiresAt) {
    return 'unknown';
  }

  const expiry = parseDateInput(expiresAt);
  const today = getToday();
  const warningDate = new Date(today);
  warningDate.setDate(warningDate.getDate() + expiringDays);

  if (expiry < today) {
    return 'expired';
  }

  if (expiry <= warningDate) {
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

export function daysUntilExpiry(expiresAt: string) {
  const today = getToday();
  const expiry = parseDateInput(expiresAt);
  const diff = expiry.getTime() - today.getTime();

  return Math.round(diff / (1000 * 60 * 60 * 24));
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
