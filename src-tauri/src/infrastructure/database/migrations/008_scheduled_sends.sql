CREATE TABLE IF NOT EXISTS scheduled_sends (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    mime_message_json TEXT NOT NULL,
    send_at TEXT NOT NULL,
    status TEXT NOT NULL,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_account_status
ON scheduled_sends(account_id, status, send_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due
ON scheduled_sends(status, send_at);
