use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Contact {
    pub id: String,
    pub account_id: String,
    pub name: Option<String>,
    pub email: String,
    pub is_me: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Contact {
    pub fn display_name(&self) -> &str {
        self.name
            .as_deref()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(&self.email)
    }
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::Contact;

    fn sample_contact(name: Option<&str>) -> Contact {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Contact {
            id: "ct_1".into(),
            account_id: "acc_1".into(),
            name: name.map(str::to_string),
            email: "hello@example.com".into(),
            is_me: false,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn falls_back_to_email_when_name_missing() {
        assert_eq!(sample_contact(None).display_name(), "hello@example.com");
    }

    #[test]
    fn prefers_name_when_present() {
        assert_eq!(
            sample_contact(Some("Open Mail")).display_name(),
            "Open Mail"
        );
    }

    #[test]
    fn serializes_contact() {
        let json = serde_json::to_string(&sample_contact(Some("Open Mail"))).unwrap();
        assert!(json.contains("\"email\":\"hello@example.com\""));
    }
}
