import { Hono } from 'hono';

import { getDb } from '../db/client';
import {
  canonicalizeTimezone,
  getStoredTimezone,
  setStoredTimezone,
} from '../utils/timezone';

export const settingsRouter = new Hono();

settingsRouter.get('/', (c) => {
  try {
    const db = getDb();
    return c.json({ data: getStoredTimezone(db) });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to fetch settings',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

settingsRouter.put('/timezone', async (c) => {
  try {
    const body = await c.req.json();
    const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : '';

    if (!timezone) {
      return c.json({ error: 'Timezone is required' }, 400);
    }

    const canonicalTimezone = canonicalizeTimezone(timezone);

    if (!canonicalTimezone) {
      return c.json({ error: 'Invalid timezone' }, 400);
    }

    const db = getDb();
    const transaction = db.transaction(() => {
      setStoredTimezone(db, canonicalTimezone);
      db.prepare('UPDATE notification_channels SET last_notified_date = NULL').run();
    });

    transaction();

    return c.json({
      data: {
        timezone: canonicalTimezone,
        configured: true,
      },
    });
  } catch (error) {
    return c.json(
      {
        error: 'Failed to update timezone',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});
