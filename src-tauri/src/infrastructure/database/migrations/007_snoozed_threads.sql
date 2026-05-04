CREATE TABLE IF NOT EXISTS snoozed_threads (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE REFERENCES threads(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    snooze_until TEXT NOT NULL,
    original_folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snoozed_threads_account_until
ON snoozed_threads(account_id, snooze_until);
