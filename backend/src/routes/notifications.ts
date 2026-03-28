import { Hono } from 'hono';

import { getDb } from '../db/client';
import { sendNotificationNow } from '../services/notifier';
import * as telegram from '../services/telegram';

interface ChannelRow {
  channel_type: string;
  enabled: number;
  config: string;
  notify_hour: number;
  last_notified_date: string | null;
  created_at: string;
  updated_at: string;
}

function maskToken(token: string): string {
  if (token.length <= 10) return '***';
  return token.slice(0, 6) + '...' + token.slice(-4);
}

function sanitizeChannel(row: ChannelRow) {
  const config = JSON.parse(row.config) as Record<string, unknown>;
  if (typeof config.botToken === 'string') {
    config.botToken = maskToken(config.botToken);
  }
  return {
    channel_type: row.channel_type,
    enabled: !!row.enabled,
    config,
    notify_hour: row.notify_hour,
    last_notified_date: row.last_notified_date,
  };
}

export const notificationsRouter = new Hono();

// ---- GET /channels ----
notificationsRouter.get('/channels', (c) => {
  try {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM notification_channels ORDER BY channel_type ASC')
      .all() as ChannelRow[];
    return c.json({ data: rows.map(sanitizeChannel) });
  } catch (error) {
    return c.json(
      { error: 'Failed to fetch channels', detail: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// ---- PUT /channels/:type ----
notificationsRouter.put('/channels/:type', async (c) => {
  try {
    const db = getDb();
    const channelType = c.req.param('type');
    const body = (await c.req.json()) as {
      enabled?: boolean;
      config?: Record<string, unknown>;
      notify_hour?: number;
    };

    const existing = db
      .prepare('SELECT * FROM notification_channels WHERE channel_type = ?')
      .get(channelType) as ChannelRow | undefined;

    const mergedConfig = existing ? JSON.parse(existing.config) : {};
    if (body.config) {
      Object.assign(mergedConfig, body.config);
    }

    const enabled = body.enabled !== undefined ? (body.enabled ? 1 : 0) : (existing?.enabled ?? 0);
    const notifyHour =
      body.notify_hour !== undefined
        ? Math.max(0, Math.min(23, Math.floor(body.notify_hour)))
        : (existing?.notify_hour ?? 9);

    if (existing) {
      db.prepare(
        `UPDATE notification_channels
         SET enabled = ?, config = ?, notify_hour = ?
         WHERE channel_type = ?`,
      ).run(enabled, JSON.stringify(mergedConfig), notifyHour, channelType);
    } else {
      db.prepare(
        `INSERT INTO notification_channels (channel_type, enabled, config, notify_hour)
         VALUES (?, ?, ?, ?)`,
      ).run(channelType, enabled, JSON.stringify(mergedConfig), notifyHour);
    }

    const row = db
      .prepare('SELECT * FROM notification_channels WHERE channel_type = ?')
      .get(channelType) as ChannelRow;

    return c.json({ data: sanitizeChannel(row) });
  } catch (error) {
    return c.json(
      { error: 'Failed to update channel', detail: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// ---- DELETE /channels/:type ----
notificationsRouter.delete('/channels/:type', (c) => {
  try {
    const db = getDb();
    const channelType = c.req.param('type');
    const result = db
      .prepare('DELETE FROM notification_channels WHERE channel_type = ?')
      .run(channelType);

    if (result.changes === 0) {
      return c.json({ error: 'Channel not found' }, 404);
    }
    return c.json({ data: { deleted: true } });
  } catch (error) {
    return c.json(
      { error: 'Failed to delete channel', detail: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// ---- POST /channels/telegram/verify ----
notificationsRouter.post('/channels/telegram/verify', async (c) => {
  try {
    const { botToken } = (await c.req.json()) as { botToken: string };
    if (!botToken) {
      return c.json({ error: 'botToken is required' }, 400);
    }

    const bot = await telegram.getMe(botToken);
    return c.json({ data: { botUsername: bot.username } });
  } catch (error) {
    return c.json(
      { error: 'Failed to verify bot token', detail: error instanceof Error ? error.message : 'Unknown error' },
      400,
    );
  }
});

// ---- POST /channels/telegram/link ----
notificationsRouter.post('/channels/telegram/link', async (c) => {
  try {
    const { botToken } = (await c.req.json()) as { botToken: string };
    if (!botToken) {
      return c.json({ error: 'botToken is required' }, 400);
    }

    const result = await telegram.waitForStart(botToken, 30);

    if (!result) {
      return c.json({ data: { linked: false } });
    }

    const bot = await telegram.getMe(botToken);
    const db = getDb();
    const config = JSON.stringify({
      botToken,
      chatId: result.chatId,
      botUsername: bot.username,
    });

    const existing = db
      .prepare('SELECT channel_type FROM notification_channels WHERE channel_type = ?')
      .get('telegram');

    if (existing) {
      db.prepare(
        `UPDATE notification_channels SET config = ?, enabled = 1 WHERE channel_type = ?`,
      ).run(config, 'telegram');
    } else {
      db.prepare(
        `INSERT INTO notification_channels (channel_type, enabled, config) VALUES (?, 1, ?)`,
      ).run('telegram', config);
    }

    return c.json({
      data: {
        linked: true,
        chatId: result.chatId,
        botUsername: bot.username,
      },
    });
  } catch (error) {
    return c.json(
      { error: 'Failed to link Telegram', detail: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

// ---- POST /channels/:type/test ----
notificationsRouter.post('/channels/:type/test', async (c) => {
  try {
    const channelType = c.req.param('type');
    const result = await sendNotificationNow(channelType);
    return c.json({ data: { message: result } });
  } catch (error) {
    return c.json(
      { error: 'Failed to send test notification', detail: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});
