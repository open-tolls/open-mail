use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum MailTask {
    MarkAsRead { message_ids: Vec<String> },
    MarkAsUnread { message_ids: Vec<String> },
    SendOutbox { account_id: String },
    SyncDraftSaved { account_id: String, draft_id: String },
    SyncDraftDeleted { account_id: String, draft_id: String },
}
