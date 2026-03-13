use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Attachment {
    pub id: String,
    pub message_id: String,
    pub filename: String,
    pub content_type: String,
    pub size: u64,
    pub content_id: Option<String>,
    pub is_inline: bool,
    pub local_path: Option<PathBuf>,
}

#[cfg(test)]
mod tests {
    use super::Attachment;

    #[test]
    fn serializes_attachment() {
        let attachment = Attachment {
            id: "att_1".into(),
            message_id: "msg_1".into(),
            filename: "invoice.pdf".into(),
            content_type: "application/pdf".into(),
            size: 2048,
            content_id: None,
            is_inline: false,
            local_path: Some("cache/invoice.pdf".into()),
        };

        let json = serde_json::to_string(&attachment).unwrap();
        assert!(json.contains("\"filename\":\"invoice.pdf\""));
    }
}
