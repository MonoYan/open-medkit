export const schema = `
CREATE TABLE IF NOT EXISTS medicines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  name_en     TEXT,
  spec        TEXT,
  quantity    TEXT,
  expires_at  TEXT,
  category    TEXT,
  usage_desc  TEXT,
  location    TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS medicines_updated_at
AFTER UPDATE ON medicines
BEGIN
  UPDATE medicines SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS notification_channels (
  channel_type       TEXT PRIMARY KEY,
  enabled            INTEGER NOT NULL DEFAULT 0,
  config             TEXT NOT NULL DEFAULT '{}',
  notify_hour        INTEGER NOT NULL DEFAULT 9,
  last_notified_date TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS notification_channels_updated_at
AFTER UPDATE ON notification_channels
BEGIN
  UPDATE notification_channels SET updated_at = datetime('now') WHERE channel_type = NEW.channel_type;
END;
`;

export const DEFAULT_CATEGORIES = [
  '感冒发烧',
  '外伤处理',
  '慢性病用药',
  '维生素补剂',
  '皮肤外用',
  '消化系统',
  '其他',
];
