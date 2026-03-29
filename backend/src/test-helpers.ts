import Database from 'better-sqlite3';
import { vi } from 'vitest';

import { schema } from './db/schema';
import type { SqliteDatabase } from './db/client';

export function createTestDb(): SqliteDatabase {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return db;
}

let testDb: SqliteDatabase | null = null;

export function setupTestDb() {
  testDb = createTestDb();
  vi.mock('./db/client', () => ({
    getDb: () => testDb,
  }));
  return testDb;
}

export function getTestDb() {
  if (!testDb) throw new Error('Call setupTestDb() first');
  return testDb;
}

export function teardownTestDb() {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

export function insertTestMedicine(
  db: SqliteDatabase,
  data: {
    name: string;
    name_en?: string;
    spec?: string;
    quantity?: string;
    expires_at?: string;
    category?: string;
    usage_desc?: string;
    location?: string;
    notes?: string;
  },
) {
  return db
    .prepare(
      `INSERT INTO medicines (name, name_en, spec, quantity, expires_at, category, usage_desc, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      data.name,
      data.name_en || null,
      data.spec || null,
      data.quantity || null,
      data.expires_at || null,
      data.category || null,
      data.usage_desc || null,
      data.location || null,
      data.notes || null,
    );
}
