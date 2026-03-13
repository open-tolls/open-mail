use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::models::{attachment::Attachment, contact::Contact};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Message {
    pub id: String,
    pub account_id: String,
    pub thread_id: String,
    pub from: Vec<Contact>,
    pub to: Vec<Contact>,
    pub cc: Vec<Contact>,
    pub bcc: Vec<Contact>,
    pub reply_to: Vec<Contact>,
    pub subject: String,
    pub snippet: String,
    pub body: String,
    pub plain_text: Option<String>,
    pub message_id_header: String,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub folder_id: String,
    pub label_ids: Vec<String>,
    pub is_unread: bool,
    pub is_starred: bool,
    pub is_draft: bool,
    pub date: DateTime<Utc>,
    pub attachments: Vec<Attachment>,
    pub headers: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Message {
    pub fn is_reply(&self) -> bool {
        self.in_reply_to
            .as_deref()
            .is_some_and(|reference| !reference.trim().is_empty())
            || !self.references.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use chrono::DateTime;

    use super::Message;
    use crate::domain::models::{attachment::Attachment, contact::Contact};

    fn sample_contact() -> Contact {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Contact {
            id: "ct_1".into(),
            account_id: "acc_1".into(),
            name: Some("Open Mail".into()),
            email: "hello@example.com".into(),
            is_me: false,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_message() -> Message {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Message {
            id: "msg_1".into(),
            account_id: "acc_1".into(),
            thread_id: "thr_1".into(),
            from: vec![sample_contact()],
            to: vec![],
            cc: vec![],
            bcc: vec![],
            reply_to: vec![],
            subject: "Subject".into(),
            snippet: "Preview".into(),
            body: "<p>Hello</p>".into(),
            plain_text: Some("Hello".into()),
            message_id_header: "<msg_1@example.com>".into(),
            in_reply_to: None,
            references: vec![],
            folder_id: "inbox".into(),
            label_ids: vec!["important".into()],
            is_unread: true,
            is_starred: false,
            is_draft: false,
            date: timestamp,
            attachments: vec![Attachment {
                id: "att_1".into(),
                message_id: "msg_1".into(),
                filename: "invoice.pdf".into(),
                content_type: "application/pdf".into(),
                size: 2048,
                content_id: None,
                is_inline: false,
                local_path: None,
            }],
            headers: HashMap::from([("x-open-mail".into(), "true".into())]),
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn detects_reply_via_headers() {
        let mut message = sample_message();
        assert!(!message.is_reply());

        message.in_reply_to = Some("<previous@example.com>".into());
        assert!(message.is_reply());
    }

    #[test]
    fn serializes_message() {
        let json = serde_json::to_string(&sample_message()).unwrap();
        assert!(json.contains("\"subject\":\"Subject\""));
    }
}
