use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SnoozedThread {
    pub id: String,
    pub thread_id: String,
    pub account_id: String,
    pub snooze_until: DateTime<Utc>,
    pub original_folder_id: String,
    pub created_at: DateTime<Utc>,
}
