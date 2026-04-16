use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("account not found: {0}")]
    AccountNotFound(String),
    #[error("imap connection failed: {0}")]
    Connection(String),
    #[error("sync task join failed: {0}")]
    Join(String),
    #[error("sync operation failed: {0}")]
    Operation(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Credentials {
    Password { username: String, password: String },
    OAuth2 { username: String, access_token: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SyncPhase {
    Connecting,
    DiscoveringFolders,
    SyncingFolders,
    Idling,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncFolderState {
    pub path: String,
    pub display_name: String,
    pub unread_count: u32,
    pub total_count: u32,
    pub envelopes_discovered: u32,
    pub messages_applied: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncMessageObservation {
    pub uid: u64,
    pub uid_validity: u64,
    pub message_id: String,
    pub thread_id: String,
    pub folder_path: String,
    pub subject: String,
    pub snippet: String,
    pub plain_text: Option<String>,
    pub observed_at: DateTime<Utc>,
    pub is_unread: bool,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusSnapshot {
    pub state: crate::domain::models::account::SyncState,
    pub phase: Option<SyncPhase>,
    pub folders: Vec<SyncFolderState>,
    pub folders_synced: u32,
    pub messages_observed: u32,
    pub last_sync_started_at: Option<DateTime<Utc>>,
    pub last_sync_finished_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

impl SyncStatusSnapshot {
    pub fn from_state(state: crate::domain::models::account::SyncState) -> Self {
        Self {
            state,
            phase: None,
            folders: Vec::new(),
            folders_synced: 0,
            messages_observed: 0,
            last_sync_started_at: None,
            last_sync_finished_at: None,
            last_error: None,
        }
    }
}
