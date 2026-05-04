use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::infrastructure::sync::MimeMessage;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ScheduledSend {
    pub id: String,
    pub account_id: String,
    pub mime_message: MimeMessage,
    pub send_at: DateTime<Utc>,
    pub status: ScheduledSendStatus,
    pub last_error: Option<String>,
    pub sent_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ScheduledSendStatus {
    Pending,
    Sending,
    Sent,
    Failed,
    Cancelled,
}
