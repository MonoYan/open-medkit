import type { SqliteDatabase } from '../db/client';
import { getDb } from '../db/client';
import * as telegram from './telegram';

// ---------------------------------------------------------------------------
// Channel abstraction
// ---------------------------------------------------------------------------

interface NotificationSender {
  send(config: Record<string, string>, message: string): Promise<void>;
}

const senders: Record<string, NotificationSender> = {
  telegram: {
    async send(config, message) {
      if (!config.botToken || !config.chatId) {
        throw new Error('Telegram channel not fully configured');
      }
      await telegram.sendMessage(config.botToken, config.chatId, message);
    },
  },
};

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------

interface MedicineRow {
  id: number;
  name: string;
  expires_at: string | null;
}

function daysUntil(dateStr: string, today: string): number {
  const d = new Date(dateStr);
  const t = new Date(today);
  return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildNotificationMessage(
  expired: MedicineRow[],
  expiring: MedicineRow[],
  todayStr: string,
): string {
  const lines: string[] = ['⚠️ <b>药品过期提醒</b>', ''];

  if (expired.length > 0) {
    lines.push(`<b>已过期（${expired.length} 件）：</b>`);
    for (const m of expired) {
      const days = Math.abs(daysUntil(m.expires_at!, todayStr));
      lines.push(`  • ${m.name} — 已过期 ${days} 天（${m.expires_at}）`);
    }
    lines.push('');
  }

  if (expiring.length > 0) {
    lines.push(`<b>即将过期（${expiring.length} 件）：</b>`);
    for (const m of expiring) {
      const days = daysUntil(m.expires_at!, todayStr);
      lines.push(`  • ${m.name} — ${days} 天后到期（${m.expires_at}）`);
    }
    lines.push('');
  }

  lines.push('请及时处理。');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core check logic (exported for manual trigger / test)
// ---------------------------------------------------------------------------

interface ChannelRow {
  channel_type: string;
  enabled: number;
  config: string;
  notify_hour: number;
  last_notified_date: string | null;
}

function queryExpiringMedicines(db: SqliteDatabase, expiringDays = 30) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + expiringDays);
  const futureDateStr = futureDate.toISOString().slice(0, 10);

  const expired = db
    .prepare(
      `SELECT id, name, expires_at FROM medicines
       WHERE expires_at IS NOT NULL AND expires_at != '' AND expires_at < ?
       ORDER BY expires_at ASC`,
    )
    .all(todayStr) as MedicineRow[];

  const expiring = db
    .prepare(
      `SELECT id, name, expires_at FROM medicines
       WHERE expires_at IS NOT NULL AND expires_at != '' AND expires_at >= ? AND expires_at <= ?
       ORDER BY expires_at ASC`,
    )
    .all(todayStr, futureDateStr) as MedicineRow[];

  return { expired, expiring, todayStr };
}

export async function sendNotificationNow(channelType: string): Promise<string> {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM notification_channels WHERE channel_type = ?')
    .get(channelType) as ChannelRow | undefined;

  if (!row) throw new Error(`Channel "${channelType}" not configured`);
  if (!row.enabled) throw new Error(`Channel "${channelType}" is disabled`);

  const config = JSON.parse(row.config) as Record<string, string>;
  const sender = senders[channelType];
  if (!sender) throw new Error(`Unknown channel type: ${channelType}`);

  const { expired, expiring, todayStr } = queryExpiringMedicines(db);

  if (expired.length === 0 && expiring.length === 0) {
    return '当前没有过期或即将过期的药品，无需发送提醒。';
  }

  const message = buildNotificationMessage(expired, expiring, todayStr);
  await sender.send(config, message);
  return `已发送通知：${expired.length} 件已过期，${expiring.length} 件即将过期。`;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;

async function tick() {
  try {
    const db = getDb();
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().slice(0, 10);

    const channels = db
      .prepare('SELECT * FROM notification_channels WHERE enabled = 1')
      .all() as ChannelRow[];

    for (const ch of channels) {
      if (ch.notify_hour !== currentHour) continue;
      if (ch.last_notified_date === todayStr) continue;

      const config = JSON.parse(ch.config) as Record<string, string>;
      const sender = senders[ch.channel_type];
      if (!sender) continue;

      const { expired, expiring } = queryExpiringMedicines(db);
      if (expired.length === 0 && expiring.length === 0) {
        db.prepare(
          'UPDATE notification_channels SET last_notified_date = ? WHERE channel_type = ?',
        ).run(todayStr, ch.channel_type);
        continue;
      }

      const message = buildNotificationMessage(expired, expiring, todayStr);
      await sender.send(config, message);

      db.prepare(
        'UPDATE notification_channels SET last_notified_date = ? WHERE channel_type = ?',
      ).run(todayStr, ch.channel_type);

      console.log(`[notifier] Sent ${ch.channel_type} notification`);
    }
  } catch (err) {
    console.error('[notifier] Scheduler tick error:', err);
  }
}

export function startNotificationScheduler() {
  if (intervalId) return;
  intervalId = setInterval(() => void tick(), 60_000);
  // Run first check shortly after startup
  setTimeout(() => void tick(), 5_000);
  console.log('[notifier] Scheduler started (60s interval)');
}

export function stopNotificationScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
