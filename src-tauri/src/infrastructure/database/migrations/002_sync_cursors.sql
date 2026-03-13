CREATE TABLE IF NOT EXISTS sync_cursors (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    folder_path TEXT NOT NULL,
    last_message_id TEXT,
    last_message_observed_at TEXT,
    last_thread_id TEXT,
    observed_message_count INTEGER NOT NULL DEFAULT 0,
    last_sync_started_at TEXT,
    last_sync_finished_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (account_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursors_account ON sync_cursors(account_id);
