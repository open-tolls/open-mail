use serde::Serialize;

use crate::domain::models::{folder::Folder, thread::Thread};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub id: String,
    pub subject: String,
    pub snippet: String,
    pub participants: Vec<String>,
    pub is_unread: bool,
    pub is_starred: bool,
    pub has_attachments: bool,
    pub message_count: u32,
    pub last_message_at: String,
}

impl From<Thread> for ThreadSummary {
    fn from(thread: Thread) -> Self {
        Self {
            id: thread.id,
            subject: thread.subject,
            snippet: thread.snippet,
            participants: thread.participant_ids,
            is_unread: thread.is_unread,
            is_starred: thread.is_starred,
            has_attachments: thread.has_attachments,
            message_count: thread.message_count,
            last_message_at: thread.last_message_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxOverview {
    pub account_id: String,
    pub active_folder_id: String,
    pub folders: Vec<Folder>,
    pub threads: Vec<ThreadSummary>,
    pub sync_state: crate::domain::models::account::SyncState,
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::ThreadSummary;
    use crate::domain::models::thread::Thread;

    fn sample_thread() -> Thread {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Thread {
            id: "thr_1".into(),
            account_id: "acc_1".into(),
            subject: "Subject".into(),
            snippet: "Preview".into(),
            message_count: 2,
            participant_ids: vec!["hello@example.com".into()],
            folder_ids: vec!["fld_inbox".into()],
            label_ids: vec![],
            has_attachments: true,
            is_unread: true,
            is_starred: false,
            last_message_at: timestamp,
            last_message_sent_at: Some(timestamp),
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn builds_thread_summary_from_thread() {
        let summary = ThreadSummary::from(sample_thread());

        assert_eq!(summary.id, "thr_1");
        assert_eq!(summary.participants, vec!["hello@example.com"]);
        assert!(summary.has_attachments);
        assert_eq!(summary.message_count, 2);
    }
}
