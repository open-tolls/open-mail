use std::{collections::HashMap, sync::Arc, time::Duration};

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::models::{
    account::{Account, ConnectionSettings},
    sync_cursor::SyncCursor,
};

use super::{Credentials, SyncError, SyncMessageObservation};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapFolder {
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapFolderStatus {
    pub folder: ImapFolder,
    pub unread_count: u32,
    pub total_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapEnvelope {
    pub folder_path: String,
    pub uid: u64,
    pub uid_validity: u64,
    pub message_id: String,
    pub thread_id: String,
    pub subject: String,
    pub observed_at: DateTime<Utc>,
    pub is_seen: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdleResult {
    NewMessages { count: u32 },
    Timeout,
    Disconnected,
}

#[async_trait]
pub trait ImapClient: Send + Sync {
    async fn connect(
        &mut self,
        settings: &ConnectionSettings,
        credentials: &Credentials,
    ) -> Result<(), SyncError>;
    async fn list_folders(&mut self) -> Result<Vec<ImapFolder>, SyncError>;
    async fn fetch_folder_statuses(&mut self) -> Result<Vec<ImapFolderStatus>, SyncError>;
    async fn fetch_new_envelopes(
        &mut self,
        cursors: &[SyncCursor],
    ) -> Result<Vec<ImapEnvelope>, SyncError>;
    async fn fetch_message_observations(
        &mut self,
        envelopes: &[ImapEnvelope],
    ) -> Result<Vec<SyncMessageObservation>, SyncError>;
    async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError>;
}

#[async_trait]
pub trait ImapClientFactory: Send + Sync {
    async fn create(&self, account: &Account) -> Result<Box<dyn ImapClient>, SyncError>;
}

#[derive(Default)]
pub struct FakeImapClientFactory;

struct FakeImapClient {
    account_id: String,
    connected: bool,
    idle_cycles: u32,
}

fn fake_envelopes(observed_at: DateTime<Utc>) -> Vec<ImapEnvelope> {
    vec![
        ImapEnvelope {
            uid: 101,
            uid_validity: 1,
            message_id: "msg_1".into(),
            thread_id: "thr_1".into(),
            folder_path: "INBOX".into(),
            subject: "Premium motion system approved".into(),
            observed_at,
            is_seen: false,
        },
        ImapEnvelope {
            uid: 205,
            uid_validity: 1,
            message_id: "msg_2".into(),
            thread_id: "thr_2".into(),
            folder_path: "Starred".into(),
            subject: "Rust health-check online".into(),
            observed_at,
            is_seen: true,
        },
    ]
}

fn fake_observation_from_envelope(envelope: &ImapEnvelope) -> SyncMessageObservation {
    let snippet = match envelope.message_id.as_str() {
        "msg_1" => {
            "Vamos fechar a base visual do composer e da thread list hoje. Sync confirmado."
        }
        "msg_2" => {
            "IPC inicial respondeu sem erro e o shell já consegue refletir o estado. Sync confirmado."
        }
        _ => "Sync confirmou uma nova mensagem.",
    };

    SyncMessageObservation {
        uid: envelope.uid,
        uid_validity: envelope.uid_validity,
        message_id: envelope.message_id.clone(),
        thread_id: envelope.thread_id.clone(),
        folder_path: envelope.folder_path.clone(),
        subject: envelope.subject.clone(),
        snippet: snippet.into(),
        plain_text: Some(snippet.into()),
        observed_at: envelope.observed_at,
        is_unread: !envelope.is_seen,
        headers: HashMap::from([("x-open-mail-sync".into(), "confirmed".into())]),
    }
}

#[async_trait]
impl ImapClient for FakeImapClient {
    async fn connect(
        &mut self,
        settings: &ConnectionSettings,
        _credentials: &Credentials,
    ) -> Result<(), SyncError> {
        if settings.imap_host.trim().is_empty() {
            return Err(SyncError::Connection("imap host cannot be empty".into()));
        }

        self.connected = true;
        Ok(())
    }

    async fn list_folders(&mut self) -> Result<Vec<ImapFolder>, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        Ok(vec![
            ImapFolder {
                path: "INBOX".into(),
                display_name: format!("{} Inbox", self.account_id),
            },
            ImapFolder {
                path: "Archive".into(),
                display_name: "Archive".into(),
            },
        ])
    }

    async fn fetch_folder_statuses(&mut self) -> Result<Vec<ImapFolderStatus>, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        Ok(vec![
            ImapFolderStatus {
                folder: ImapFolder {
                    path: "INBOX".into(),
                    display_name: format!("{} Inbox", self.account_id),
                },
                unread_count: 2,
                total_count: 12,
            },
            ImapFolderStatus {
                folder: ImapFolder {
                    path: "Archive".into(),
                    display_name: "Archive".into(),
                },
                unread_count: 0,
                total_count: 4,
            },
        ])
    }

    async fn fetch_new_envelopes(
        &mut self,
        cursors: &[SyncCursor],
    ) -> Result<Vec<ImapEnvelope>, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        let observed_at = DateTime::parse_from_rfc3339("2026-03-13T10:05:00Z")
            .map(|timestamp| timestamp.with_timezone(&Utc))
            .map_err(|error| SyncError::Operation(error.to_string()))?;
        let envelopes = fake_envelopes(observed_at);

        Ok(envelopes
            .into_iter()
            .filter(|envelope| {
                !cursors.iter().any(|cursor| {
                    cursor.folder_path.eq_ignore_ascii_case(&envelope.folder_path)
                        && cursor.uid_validity == Some(envelope.uid_validity)
                        && cursor
                            .last_seen_uid
                            .is_some_and(|last_seen_uid| last_seen_uid >= envelope.uid)
                })
            })
            .collect())
    }

    async fn fetch_message_observations(
        &mut self,
        envelopes: &[ImapEnvelope],
    ) -> Result<Vec<SyncMessageObservation>, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        Ok(envelopes
            .iter()
            .map(fake_observation_from_envelope)
            .collect())
    }

    async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        tokio::time::sleep(timeout).await;
        self.idle_cycles += 1;

        if self.idle_cycles == 1 {
            return Ok(IdleResult::NewMessages { count: 2 });
        }

        Ok(IdleResult::Timeout)
    }
}

#[async_trait]
impl ImapClientFactory for FakeImapClientFactory {
    async fn create(&self, account: &Account) -> Result<Box<dyn ImapClient>, SyncError> {
        Ok(Box::new(FakeImapClient {
            account_id: account.id.clone(),
            connected: false,
            idle_cycles: 0,
        }))
    }
}

pub type SharedImapClientFactory = Arc<dyn ImapClientFactory>;

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;
    use crate::domain::models::account::SecurityType;

    fn settings() -> ConnectionSettings {
        ConnectionSettings {
            imap_host: "imap.example.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.example.com".into(),
            smtp_port: 587,
            smtp_security: SecurityType::StartTls,
        }
    }

    fn cursor(folder_path: &str, last_seen_uid: u64) -> SyncCursor {
        SyncCursor {
            account_id: "acc_1".into(),
            folder_id: format!("fld_{}", folder_path.to_lowercase()),
            folder_path: folder_path.into(),
            uid_validity: Some(1),
            last_seen_uid: Some(last_seen_uid),
            last_message_id: None,
            last_message_observed_at: None,
            last_thread_id: None,
            observed_message_count: 0,
            last_sync_started_at: None,
            last_sync_finished_at: None,
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn fake_client_returns_only_envelopes_newer_than_cursor_uid() {
        let mut client = FakeImapClient {
            account_id: "acc_1".into(),
            connected: false,
            idle_cycles: 0,
        };
        client
            .connect(
                &settings(),
                &Credentials::Password {
                    username: "leco@example.com".into(),
                    password: "demo".into(),
                },
            )
            .await
            .unwrap();

        let envelopes = client
            .fetch_new_envelopes(&[cursor("INBOX", 101)])
            .await
            .unwrap();
        let observations = client.fetch_message_observations(&envelopes).await.unwrap();

        assert_eq!(envelopes.len(), 1);
        assert_eq!(envelopes[0].folder_path, "Starred");
        assert_eq!(observations[0].uid, envelopes[0].uid);
        assert_eq!(observations[0].message_id, envelopes[0].message_id);
        assert!(!observations[0].is_unread);
    }
}
