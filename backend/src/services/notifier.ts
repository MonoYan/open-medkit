import type { SqliteDatabase } from '../db/client';
import { getDb } from '../db/client';
import {
  getCurrentHour,
  getDateBoundaries,
  getStoredTimezone,
  getTodayStr,
} from '../utils/timezone';
import * as telegram from './telegram';
import * as discord from './discord';
import * as feishu from './feishu';

// ---------------------------------------------------------------------------
// Channel abstraction
// ---------------------------------------------------------------------------

interface NotificationSender {
  format: MessageFormat;
  send(config: Record<string, string>, message: string): Promise<void>;
}

const senders: Record<string, NotificationSender> = {
  telegram: {
    format: 'html',
    async send(config, message) {
      if (!config.botToken || !config.chatId) {
        throw new Error('Telegram channel not fully configured');
      }
      await telegram.sendMessage(config.botToken, config.chatId, message);
    },
  },
  discord: {
    format: 'markdown',
    async send(config, message) {
      if (!config.webhookUrl) {
        throw new Error('Discord channel not fully configured');
      }
      await discord.sendWebhook(config.webhookUrl, message);
    },
  },
  feishu: {
    format: 'plain',
    async send(config, message) {
      if (!config.webhookUrl) {
        throw new Error('Feishu channel not fully configured');
      }
      await feishu.sendWebhook(config.webhookUrl, message, config.secret);
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
  const [dateYear, dateMonth, dateDay] = dateStr.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const d = Date.UTC(dateYear, dateMonth - 1, dateDay);
  const t = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.ceil((d - t) / (1000 * 60 * 60 * 24));
}

export type MessageFormat = 'html' | 'markdown' | 'plain';

function bold(text: string, format: MessageFormat): string {
  switch (format) {
    case 'html':
      return `<b>${text}</b>`;
    case 'markdown':
      return `**${text}**`;
    case 'plain':
      return text;
  }
}

export function buildNotificationMessage(
  expired: MedicineRow[],
  expiring: MedicineRow[],
  todayStr: string,
  format: MessageFormat = 'html',
): string {
  const lines: string[] = [`⚠️ ${bold('药品过期提醒', format)}`, ''];

  if (expired.length > 0) {
    lines.push(bold(`已过期（${expired.length} 件）：`, format));
    for (const m of expired) {
      const days = Math.abs(daysUntil(m.expires_at!, todayStr));
      lines.push(`  • ${m.name} — 已过期 ${days} 天（${m.expires_at}）`);
    }
    lines.push('');
  }

  if (expiring.length > 0) {
    lines.push(bold(`即将过期（${expiring.length} 件）：`, format));
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

function queryExpiringMedicines(db: SqliteDatabase, timezone: string, expiringDays = 30) {
  const { todayStr, warningDateStr: futureDateStr } = getDateBoundaries(timezone, expiringDays);

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

  const { timezone } = getStoredTimezone(db);
  const { expired, expiring, todayStr } = queryExpiringMedicines(db, timezone);

  if (expired.length === 0 && expiring.length === 0) {
    return '当前没有过期或即将过期的药品，无需发送提醒。';
  }

  const message = buildNotificationMessage(expired, expiring, todayStr, sender.format);
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
    const { timezone } = getStoredTimezone(db);
    const currentHour = getCurrentHour(timezone);
    const todayStr = getTodayStr(timezone);

    const channels = db
      .prepare('SELECT * FROM notification_channels WHERE enabled = 1')
      .all() as ChannelRow[];

    for (const ch of channels) {
      if (ch.notify_hour !== currentHour) continue;
      if (ch.last_notified_date === todayStr) continue;

      const config = JSON.parse(ch.config) as Record<string, string>;
      const sender = senders[ch.channel_type];
      if (!sender) continue;

      const { expired, expiring } = queryExpiringMedicines(db, timezone);
      if (expired.length === 0 && expiring.length === 0) {
        db.prepare(
          'UPDATE notification_channels SET last_notified_date = ? WHERE channel_type = ?',
        ).run(todayStr, ch.channel_type);
        continue;
      }

      const message = buildNotificationMessage(expired, expiring, todayStr, sender.format);
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
