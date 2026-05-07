use serde::{de::DeserializeOwned, Serialize};

pub const HOOK_ON_ACCOUNT_ADDED: &str = "on_account_added";
pub const HOOK_ON_DRAFT_CREATED: &str = "on_draft_created";
pub const HOOK_ON_MESSAGE_RECEIVED: &str = "on_message_received";
pub const HOOK_ON_MESSAGE_SENT: &str = "on_message_sent";
pub const HOOK_ON_MESSAGE_SENDING: &str = "on_message_sending";
pub const HOOK_ON_SYNC_COMPLETED: &str = "on_sync_completed";
pub const HOOK_ON_THREAD_CHANGED: &str = "on_thread_changed";

pub fn hook_export_name(name: &str) -> String {
    format!("hook_{}", sanitize_export_name(name))
}

pub fn command_export_name(name: &str) -> String {
    format!("command_{}", sanitize_export_name(name))
}

pub fn to_json_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec(value)
}

pub fn from_json_bytes<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, serde_json::Error> {
    serde_json::from_slice(bytes)
}

fn sanitize_export_name(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' => character.to_ascii_lowercase(),
            _ => '_',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_expected_hook_export_names() {
        assert_eq!(hook_export_name(HOOK_ON_MESSAGE_SENDING), "hook_on_message_sending");
        assert_eq!(command_export_name("schedule-send"), "command_schedule_send");
    }

    #[test]
    fn roundtrips_json_helpers() {
        let payload = serde_json::json!({
            "subject": "Desktop alpha",
            "allow": true
        });
        let bytes = to_json_bytes(&payload).expect("json should serialize");
        let decoded: serde_json::Value = from_json_bytes(&bytes).expect("json should deserialize");

        assert_eq!(decoded, payload);
    }
}
