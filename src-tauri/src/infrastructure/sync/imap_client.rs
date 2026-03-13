use std::{sync::Arc, time::Duration};

use async_trait::async_trait;

use crate::domain::models::account::{Account, ConnectionSettings};

use super::{Credentials, SyncError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapFolder {
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdleResult {
    NewMessages,
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

    async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        tokio::time::sleep(timeout).await;
        Ok(IdleResult::Timeout)
    }
}

#[async_trait]
impl ImapClientFactory for FakeImapClientFactory {
    async fn create(&self, account: &Account) -> Result<Box<dyn ImapClient>, SyncError> {
        Ok(Box::new(FakeImapClient {
            account_id: account.id.clone(),
            connected: false,
        }))
    }
}

pub type SharedImapClientFactory = Arc<dyn ImapClientFactory>;
