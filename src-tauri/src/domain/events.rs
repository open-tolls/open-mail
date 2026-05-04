use serde::{Deserialize, Serialize};

use crate::domain::models::account::SyncState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AppShellEvent {
    ComposeNew,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum DomainEvent {
    ApplicationStarted,
    ThreadsChanged {
        account_id: String,
        thread_ids: Vec<String>,
    },
    SnoozeWoke {
        account_id: String,
        thread_id: String,
    },
    MessagesChanged {
        account_id: String,
        message_ids: Vec<String>,
    },
    FoldersChanged {
        account_id: String,
    },
    LabelsChanged {
        account_id: String,
    },
    ContactsChanged {
        account_id: String,
    },
    SyncStatusChanged {
        account_id: String,
        state: SyncState,
    },
    AccountAdded {
        account_id: String,
    },
    AccountRemoved {
        account_id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::{AppShellEvent, DomainEvent};
    use crate::domain::models::account::SyncState;

    #[test]
    fn serializes_domain_events() {
        let event = DomainEvent::SyncStatusChanged {
            account_id: "acc_1".into(),
            state: SyncState::Running,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"type\":\"sync-status-changed\""));
        assert!(json.contains("\"accountId\":\"acc_1\""));
    }

    #[test]
    fn serializes_app_shell_events() {
        let event = AppShellEvent::ComposeNew;

        let json = serde_json::to_string(&event).unwrap();
        assert_eq!(json, "{\"type\":\"compose-new\"}");
    }
}
