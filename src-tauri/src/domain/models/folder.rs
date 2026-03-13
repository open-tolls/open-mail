use std::fmt::{Display, Formatter};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Folder {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub path: String,
    pub role: Option<FolderRole>,
    pub unread_count: u32,
    pub total_count: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum FolderRole {
    Inbox,
    Sent,
    Drafts,
    Trash,
    Spam,
    Archive,
    All,
    Starred,
    Important,
}

impl Folder {
    pub fn is_system_folder(&self) -> bool {
        self.role.is_some()
    }
}

impl Display for FolderRole {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let role = match self {
            Self::Inbox => "inbox",
            Self::Sent => "sent",
            Self::Drafts => "drafts",
            Self::Trash => "trash",
            Self::Spam => "spam",
            Self::Archive => "archive",
            Self::All => "all",
            Self::Starred => "starred",
            Self::Important => "important",
        };

        write!(f, "{role}")
    }
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::{Folder, FolderRole};

    fn sample_folder(role: Option<FolderRole>) -> Folder {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Folder {
            id: "fld_1".into(),
            account_id: "acc_1".into(),
            name: "Inbox".into(),
            path: "INBOX".into(),
            role,
            unread_count: 12,
            total_count: 42,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn identifies_system_folder() {
        assert!(sample_folder(Some(FolderRole::Inbox)).is_system_folder());
        assert!(!sample_folder(None).is_system_folder());
    }

    #[test]
    fn serializes_folder() {
        let json = serde_json::to_string(&sample_folder(Some(FolderRole::Inbox))).unwrap();
        assert!(json.contains("\"path\":\"INBOX\""));
    }
}
