CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  account_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signatures_account_id ON signatures(account_id);

CREATE TABLE IF NOT EXISTS signature_defaults (
  scope_key TEXT PRIMARY KEY,
  signature_id TEXT NULL,
  FOREIGN KEY(signature_id) REFERENCES signatures(id) ON DELETE SET NULL
);

