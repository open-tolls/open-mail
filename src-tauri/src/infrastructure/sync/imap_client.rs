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
pub struct ImapFolderStatus {
    pub folder: ImapFolder,
    pub unread_count: u32,
    pub total_count: u32,
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

    async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        tokio::time::sleep(timeout).await;
        self.idle_cycles += 1;

        if self.idle_cycles == 1 {
            return Ok(IdleResult::NewMessages { count: 3 });
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
