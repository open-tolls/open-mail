use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncCursor {
    pub account_id: String,
    pub folder_id: String,
    pub folder_path: String,
    pub uid_validity: Option<u64>,
    pub last_seen_uid: Option<u64>,
    pub last_message_id: Option<String>,
    pub last_message_observed_at: Option<DateTime<Utc>>,
    pub last_thread_id: Option<String>,
    pub observed_message_count: u32,
    pub last_sync_started_at: Option<DateTime<Utc>>,
    pub last_sync_finished_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}
