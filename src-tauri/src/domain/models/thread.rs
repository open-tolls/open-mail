use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::models::message::Message;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Thread {
    pub id: String,
    pub account_id: String,
    pub subject: String,
    pub snippet: String,
    pub message_count: u32,
    pub participant_ids: Vec<String>,
    pub folder_ids: Vec<String>,
    pub label_ids: Vec<String>,
    pub has_attachments: bool,
    pub is_unread: bool,
    pub is_starred: bool,
    pub last_message_at: DateTime<Utc>,
    pub last_message_sent_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Thread {
    pub fn update_from_messages(&mut self, messages: &[Message]) {
        if messages.is_empty() {
            self.message_count = 0;
            self.snippet.clear();
            self.has_attachments = false;
            self.is_unread = false;
            self.is_starred = false;
            self.participant_ids.clear();
            self.folder_ids.clear();
            self.label_ids.clear();
            self.last_message_sent_at = None;
            return;
        }

        let mut sorted_messages = messages.iter().collect::<Vec<_>>();
        sorted_messages.sort_by_key(|message| message.date);

        if let Some(latest_message) = sorted_messages.last() {
            self.subject = latest_message.subject.clone();
            self.snippet = latest_message.snippet.clone();
            self.last_message_at = latest_message.date;
            self.updated_at = latest_message.updated_at;
        }

        self.message_count = sorted_messages.len() as u32;
        self.has_attachments = sorted_messages
            .iter()
            .any(|message| !message.attachments.is_empty());
        self.is_unread = sorted_messages.iter().any(|message| message.is_unread);
        self.is_starred = sorted_messages.iter().any(|message| message.is_starred);
        self.last_message_sent_at = sorted_messages
            .iter()
            .filter(|message| !message.is_draft)
            .map(|message| message.date)
            .max();
        self.participant_ids = collect_unique(sorted_messages.iter().flat_map(|message| {
            message
                .from
                .iter()
                .chain(message.to.iter())
                .chain(message.cc.iter())
                .chain(message.bcc.iter())
                .map(|contact| contact.id.clone())
        }));
        self.folder_ids = collect_unique(
            sorted_messages
                .iter()
                .map(|message| message.folder_id.clone()),
        );
        self.label_ids = collect_unique(
            sorted_messages
                .iter()
                .flat_map(|message| message.label_ids.iter().cloned()),
        );
    }
}

fn collect_unique(values: impl Iterator<Item = String>) -> Vec<String> {
    let mut unique_values = Vec::new();

    for value in values {
        if !unique_values.contains(&value) {
            unique_values.push(value);
        }
    }

    unique_values
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::Thread;
    use crate::domain::models::{attachment::Attachment, contact::Contact, message::Message};

    fn sample_contact(id: &str) -> Contact {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Contact {
            id: id.into(),
            account_id: "acc_1".into(),
            name: Some(format!("Contact {id}")),
            email: format!("{id}@example.com"),
            is_me: false,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_message(id: &str, minute: u8, unread: bool) -> Message {
        let timestamp = DateTime::parse_from_rfc3339(&format!("2026-03-13T10:{minute:02}:00Z"))
            .unwrap()
            .with_timezone(&chrono::Utc);

        Message {
            id: id.into(),
            account_id: "acc_1".into(),
            thread_id: "thr_1".into(),
            from: vec![sample_contact("from")],
            to: vec![sample_contact("to")],
            cc: vec![],
            bcc: vec![],
            reply_to: vec![],
            subject: format!("Subject {id}"),
            snippet: format!("Snippet {id}"),
            body: "<p>Hello</p>".into(),
            plain_text: Some("Hello".into()),
            message_id_header: format!("<{id}@example.com>"),
            in_reply_to: None,
            references: vec![],
            folder_id: "inbox".into(),
            label_ids: vec!["important".into()],
            is_unread: unread,
            is_starred: !unread,
            is_draft: false,
            date: timestamp,
            attachments: if unread {
                vec![Attachment {
                    id: "att_1".into(),
                    message_id: id.into(),
                    filename: "invoice.pdf".into(),
                    content_type: "application/pdf".into(),
                    size: 2048,
                    content_id: None,
                    is_inline: false,
                    local_path: None,
                }]
            } else {
                vec![]
            },
            headers: Default::default(),
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_thread() -> Thread {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Thread {
            id: "thr_1".into(),
            account_id: "acc_1".into(),
            subject: "Initial".into(),
            snippet: "".into(),
            message_count: 0,
            participant_ids: vec![],
            folder_ids: vec![],
            label_ids: vec![],
            has_attachments: false,
            is_unread: false,
            is_starred: false,
            last_message_at: timestamp,
            last_message_sent_at: None,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn recomputes_thread_from_messages() {
        let mut thread = sample_thread();
        let messages = vec![
            sample_message("msg_1", 5, false),
            sample_message("msg_2", 10, true),
        ];

        thread.update_from_messages(&messages);

        assert_eq!(thread.message_count, 2);
        assert_eq!(thread.subject, "Subject msg_2");
        assert_eq!(thread.snippet, "Snippet msg_2");
        assert!(thread.has_attachments);
        assert!(thread.is_unread);
        assert!(thread.is_starred);
        assert_eq!(thread.participant_ids.len(), 2);
        assert_eq!(thread.folder_ids, vec!["inbox"]);
        assert_eq!(thread.label_ids, vec!["important"]);
    }

    #[test]
    fn serializes_thread() {
        let json = serde_json::to_string(&sample_thread()).unwrap();
        assert!(json.contains("\"id\":\"thr_1\""));
    }
}
