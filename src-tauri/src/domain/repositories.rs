use std::collections::HashMap;

use async_trait::async_trait;

use crate::domain::{
    errors::DomainError,
    models::{
        account::Account,
        contact::Contact,
        folder::{Folder, FolderRole},
        message::Message,
        outbox::{OutboxMessage, OutboxStatus},
        signature::Signature,
        sync_cursor::SyncCursor,
        thread::Thread,
    },
};

#[async_trait]
pub trait ThreadRepository: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Result<Option<Thread>, DomainError>;
    async fn find_by_folder(
        &self,
        account_id: &str,
        folder_id: &str,
        offset: u32,
        limit: u32,
    ) -> Result<Vec<Thread>, DomainError>;
    async fn find_unread(&self, account_id: &str) -> Result<Vec<Thread>, DomainError>;
    async fn find_starred(&self, account_id: &str) -> Result<Vec<Thread>, DomainError>;
    async fn search(&self, account_id: &str, query: &str) -> Result<Vec<Thread>, DomainError>;
    async fn save(&self, thread: &Thread) -> Result<(), DomainError>;
    async fn save_batch(&self, threads: &[Thread]) -> Result<(), DomainError>;
    async fn delete(&self, id: &str) -> Result<(), DomainError>;
    async fn count_by_folder(&self, account_id: &str, folder_id: &str) -> Result<u32, DomainError>;
    async fn count_unread_by_folder(
        &self,
        account_id: &str,
        folder_id: &str,
    ) -> Result<u32, DomainError>;
}

#[async_trait]
pub trait MessageRepository: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Result<Option<Message>, DomainError>;
    async fn find_by_thread(&self, thread_id: &str) -> Result<Vec<Message>, DomainError>;
    async fn find_drafts(&self, account_id: &str) -> Result<Vec<Message>, DomainError>;
    async fn save(&self, message: &Message) -> Result<(), DomainError>;
    async fn save_batch(&self, messages: &[Message]) -> Result<(), DomainError>;
    async fn delete(&self, id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait AccountRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Account>, DomainError>;
    async fn find_by_id(&self, id: &str) -> Result<Option<Account>, DomainError>;
    async fn save(&self, account: &Account) -> Result<(), DomainError>;
    async fn delete(&self, id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait FolderRepository: Send + Sync {
    async fn find_by_account(&self, account_id: &str) -> Result<Vec<Folder>, DomainError>;
    async fn find_by_id(&self, id: &str) -> Result<Option<Folder>, DomainError>;
    async fn find_by_role(
        &self,
        account_id: &str,
        role: FolderRole,
    ) -> Result<Option<Folder>, DomainError>;
    async fn save(&self, folder: &Folder) -> Result<(), DomainError>;
    async fn save_batch(&self, folders: &[Folder]) -> Result<(), DomainError>;
    async fn delete(&self, id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait ContactRepository: Send + Sync {
    async fn find_by_email(&self, email: &str) -> Result<Option<Contact>, DomainError>;
    async fn find_by_account(&self, account_id: &str) -> Result<Vec<Contact>, DomainError>;
    async fn search(&self, query: &str, limit: u32) -> Result<Vec<Contact>, DomainError>;
    async fn save(&self, contact: &Contact) -> Result<(), DomainError>;
    async fn save_batch(&self, contacts: &[Contact]) -> Result<(), DomainError>;
}

#[async_trait]
pub trait SyncCursorRepository: Send + Sync {
    async fn find_by_account(&self, account_id: &str) -> Result<Vec<SyncCursor>, DomainError>;
    async fn find_by_folder(
        &self,
        account_id: &str,
        folder_id: &str,
    ) -> Result<Option<SyncCursor>, DomainError>;
    async fn save(&self, cursor: &SyncCursor) -> Result<(), DomainError>;
}

#[async_trait]
pub trait OutboxRepository: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Result<Option<OutboxMessage>, DomainError>;
    async fn find_by_status(
        &self,
        account_id: &str,
        status: OutboxStatus,
    ) -> Result<Vec<OutboxMessage>, DomainError>;
    async fn save(&self, message: &OutboxMessage) -> Result<(), DomainError>;
}

#[async_trait]
pub trait SignatureRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Signature>, DomainError>;
    async fn find_default_global(&self) -> Result<Option<String>, DomainError>;
    async fn find_defaults_by_account(&self) -> Result<HashMap<String, Option<String>>, DomainError>;
    async fn save(&self, signature: &Signature) -> Result<(), DomainError>;
    async fn delete(&self, id: &str) -> Result<(), DomainError>;
    async fn set_default(
        &self,
        signature_id: Option<&str>,
        account_id: Option<&str>,
    ) -> Result<(), DomainError>;
}
