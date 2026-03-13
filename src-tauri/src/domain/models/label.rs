use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Label {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub display_name: String,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::Label;

    #[test]
    fn serializes_label() {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let label = Label {
            id: "lbl_1".into(),
            account_id: "acc_1".into(),
            name: "important".into(),
            display_name: "Important".into(),
            color: Some("#f6b66f".into()),
            created_at: timestamp,
            updated_at: timestamp,
        };

        let json = serde_json::to_string(&label).unwrap();
        assert!(json.contains("\"display_name\":\"Important\""));
    }
}
