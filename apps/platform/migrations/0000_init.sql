-- D1 Database Directory Schema Migration
CREATE TABLE IF NOT EXISTS friend_code_directory (
  public_id TEXT PRIMARY KEY,
  friend_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_code_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL,
  friend_code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS revoked_public_ids (
  public_id TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);
