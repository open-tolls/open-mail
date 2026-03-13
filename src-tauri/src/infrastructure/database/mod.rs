use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use rusqlite::Connection;

use crate::domain::errors::DomainError;

const INITIAL_MIGRATION: &str = include_str!("migrations/001_initial_schema.sql");
const SYNC_CURSOR_MIGRATION: &str = include_str!("migrations/002_sync_cursors.sql");

pub mod repositories;

#[derive(Debug, Clone)]
pub struct Database {
    path: PathBuf,
    connection: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self, DomainError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| DomainError::Io(error.to_string()))?;
        }

        let connection =
            Connection::open(path).map_err(|error| DomainError::Database(error.to_string()))?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(Self {
            path: path.to_path_buf(),
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    pub fn run_migrations(&self) -> Result<(), DomainError> {
        let connection = self.connection()?;
        connection
            .execute_batch(INITIAL_MIGRATION)
            .map_err(|error| DomainError::Database(error.to_string()))?;
        connection
            .execute_batch(SYNC_CURSOR_MIGRATION)
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }

    pub fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, DomainError> {
        self.connection
            .lock()
            .map_err(|_| DomainError::Database("database mutex poisoned".into()))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

pub fn subsystem_name() -> &'static str {
    "database"
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        time::{SystemTime, UNIX_EPOCH},
    };

    use chrono::{DateTime, Utc};

    use super::{
        repositories::{
            account_repository::SqliteAccountRepository,
            folder_repository::SqliteFolderRepository,
            message_repository::SqliteMessageRepository,
            sync_cursor_repository::SqliteSyncCursorRepository,
            thread_repository::SqliteThreadRepository,
        },
        Database,
    };
    use crate::domain::{
        models::account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
        models::attachment::Attachment,
        models::contact::Contact,
        models::folder::{Folder, FolderRole},
        models::message::Message,
        models::sync_cursor::SyncCursor,
        models::thread::Thread,
        repositories::AccountRepository,
        repositories::FolderRepository,
        repositories::MessageRepository,
        repositories::SyncCursorRepository,
        repositories::ThreadRepository,
    };

    fn unique_database_path(prefix: &str) -> std::path::PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{unique_suffix}.db"))
    }

    fn sample_timestamp() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn sample_account() -> Account {
        let timestamp = sample_timestamp();

        Account {
            id: "acc_1".into(),
            name: "Personal".into(),
            email_address: "leco@example.com".into(),
            provider: AccountProvider::Imap,
            connection_settings: ConnectionSettings {
                imap_host: "imap.example.com".into(),
                imap_port: 993,
                imap_security: SecurityType::Ssl,
                smtp_host: "smtp.example.com".into(),
                smtp_port: 587,
                smtp_security: SecurityType::StartTls,
            },
            sync_state: SyncState::Running,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_folder(id: &str, role: FolderRole) -> Folder {
        let timestamp = sample_timestamp();

        Folder {
            id: id.into(),
            account_id: "acc_1".into(),
            name: match role {
                FolderRole::Inbox => "Inbox",
                FolderRole::Starred => "Starred",
                FolderRole::Sent => "Sent",
                FolderRole::Archive => "Archive",
                FolderRole::Drafts => "Drafts",
                FolderRole::Trash => "Trash",
                FolderRole::Spam => "Spam",
                FolderRole::All => "All Mail",
                FolderRole::Important => "Important",
            }
            .into(),
            path: id.into(),
            role: Some(role),
            unread_count: 0,
            total_count: 0,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_contact(id: &str, email: &str, is_me: bool) -> Contact {
        let timestamp = sample_timestamp();

        Contact {
            id: id.into(),
            account_id: "acc_1".into(),
            name: Some(id.replace('_', " ")),
            email: email.into(),
            is_me,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_thread() -> Thread {
        let timestamp = sample_timestamp();

        Thread {
            id: "thr_1".into(),
            account_id: "acc_1".into(),
            subject: "Launch planning".into(),
            snippet: "Initial snippet".into(),
            message_count: 2,
            participant_ids: vec![],
            folder_ids: vec!["fld_inbox".into(), "fld_starred".into()],
            label_ids: vec![],
            has_attachments: true,
            is_unread: true,
            is_starred: true,
            last_message_at: timestamp,
            last_message_sent_at: Some(timestamp),
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_messages() -> Vec<Message> {
        let timestamp = sample_timestamp();

        vec![
            Message {
                id: "msg_1".into(),
                account_id: "acc_1".into(),
                thread_id: "thr_1".into(),
                from: vec![sample_contact("atlas_design", "atlas@example.com", false)],
                to: vec![sample_contact("leco", "leco@example.com", true)],
                cc: vec![],
                bcc: vec![],
                reply_to: vec![],
                subject: "Launch planning".into(),
                snippet: "Initial snippet".into(),
                body: "<p>First message</p>".into(),
                plain_text: Some("First message".into()),
                message_id_header: "<msg_1@openmail.dev>".into(),
                in_reply_to: None,
                references: vec![],
                folder_id: "fld_inbox".into(),
                label_ids: vec![],
                is_unread: true,
                is_starred: false,
                is_draft: false,
                date: timestamp - chrono::Duration::minutes(10),
                attachments: vec![Attachment {
                    id: "att_1".into(),
                    message_id: "msg_1".into(),
                    filename: "launch-plan.pdf".into(),
                    content_type: "application/pdf".into(),
                    size: 4096,
                    content_id: None,
                    is_inline: false,
                    local_path: Some("cache/launch-plan.pdf".into()),
                }],
                headers: HashMap::from([("x-open-mail-source".into(), "integration".into())]),
                created_at: timestamp,
                updated_at: timestamp,
            },
            Message {
                id: "msg_2".into(),
                account_id: "acc_1".into(),
                thread_id: "thr_1".into(),
                from: vec![sample_contact("infra_sync", "infra@example.com", false)],
                to: vec![sample_contact("leco", "leco@example.com", true)],
                cc: vec![],
                bcc: vec![],
                reply_to: vec![],
                subject: "Launch planning".into(),
                snippet: "Follow-up snippet".into(),
                body: "<p>Second message</p>".into(),
                plain_text: Some("Second message".into()),
                message_id_header: "<msg_2@openmail.dev>".into(),
                in_reply_to: Some("<msg_1@openmail.dev>".into()),
                references: vec!["<msg_1@openmail.dev>".into()],
                folder_id: "fld_starred".into(),
                label_ids: vec![],
                is_unread: false,
                is_starred: true,
                is_draft: false,
                date: timestamp,
                attachments: vec![],
                headers: HashMap::from([("x-open-mail-source".into(), "follow-up".into())]),
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]
    }

    #[test]
    fn creates_database_and_runs_migrations() {
        let database_path = unique_database_path("open-mail");
        let database = Database::new(&database_path).unwrap();

        database.run_migrations().unwrap();

        let connection = database.connection().unwrap();
        let mut statement = connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
            .unwrap();
        let mut rows = statement.query([]).unwrap();

        assert!(rows.next().unwrap().is_some());
    }

    #[tokio::test]
    async fn persists_and_reads_accounts() {
        let database_path = unique_database_path("open-mail-account");
        let database = Database::new(&database_path).unwrap();
        database.run_migrations().unwrap();
        let repository = SqliteAccountRepository::new(database.clone());
        let account = sample_account();

        repository.save(&account).await.unwrap();

        let persisted = repository.find_by_id("acc_1").await.unwrap().unwrap();
        assert_eq!(persisted.email_address, "leco@example.com");
    }

    #[tokio::test]
    async fn persists_and_reads_folder_roles() {
        let database_path = unique_database_path("open-mail-folder");
        let database = Database::new(&database_path).unwrap();
        database.run_migrations().unwrap();

        let account_repo = SqliteAccountRepository::new(database.clone());
        let folder_repo = SqliteFolderRepository::new(database.clone());
        account_repo.save(&sample_account()).await.unwrap();

        folder_repo
            .save_batch(&[
                sample_folder("fld_inbox", FolderRole::Inbox),
                sample_folder("fld_archive", FolderRole::Archive),
            ])
            .await
            .unwrap();

        let folders = folder_repo.find_by_account("acc_1").await.unwrap();
        let archive = folder_repo
            .find_by_role("acc_1", FolderRole::Archive)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(folders.len(), 2);
        assert_eq!(archive.id, "fld_archive");
    }

    #[tokio::test]
    async fn hydrates_threads_with_related_folder_and_participant_data() {
        let database_path = unique_database_path("open-mail-thread");
        let database = Database::new(&database_path).unwrap();
        database.run_migrations().unwrap();

        let account_repo = SqliteAccountRepository::new(database.clone());
        let folder_repo = SqliteFolderRepository::new(database.clone());
        let thread_repo = SqliteThreadRepository::new(database.clone());
        let message_repo = SqliteMessageRepository::new(database.clone());

        account_repo.save(&sample_account()).await.unwrap();
        folder_repo
            .save_batch(&[
                sample_folder("fld_inbox", FolderRole::Inbox),
                sample_folder("fld_starred", FolderRole::Starred),
            ])
            .await
            .unwrap();
        thread_repo.save(&sample_thread()).await.unwrap();
        message_repo.save_batch(&sample_messages()).await.unwrap();

        let persisted_thread = thread_repo.find_by_id("thr_1").await.unwrap().unwrap();
        let folder_threads = thread_repo
            .find_by_folder("acc_1", "fld_starred", 0, 25)
            .await
            .unwrap();

        assert_eq!(
            persisted_thread.folder_ids,
            vec!["fld_inbox".to_string(), "fld_starred".to_string()]
        );
        assert_eq!(
            persisted_thread.participant_ids,
            vec![
                "atlas@example.com".to_string(),
                "leco@example.com".to_string(),
                "infra@example.com".to_string()
            ]
        );
        assert_eq!(folder_threads.len(), 1);
        assert_eq!(thread_repo.count_by_folder("acc_1", "fld_starred").await.unwrap(), 1);
        assert_eq!(
            thread_repo
                .count_unread_by_folder("acc_1", "fld_starred")
                .await
                .unwrap(),
            1
        );
    }

    #[tokio::test]
    async fn persists_message_attachments_labels_and_cascade_deletes_on_account_removal() {
        let database_path = unique_database_path("open-mail-message");
        let database = Database::new(&database_path).unwrap();
        database.run_migrations().unwrap();

        let account_repo = SqliteAccountRepository::new(database.clone());
        let folder_repo = SqliteFolderRepository::new(database.clone());
        let thread_repo = SqliteThreadRepository::new(database.clone());
        let message_repo = SqliteMessageRepository::new(database.clone());

        account_repo.save(&sample_account()).await.unwrap();
        folder_repo
            .save_batch(&[
                sample_folder("fld_inbox", FolderRole::Inbox),
                sample_folder("fld_starred", FolderRole::Starred),
            ])
            .await
            .unwrap();
        thread_repo.save(&sample_thread()).await.unwrap();
        message_repo.save_batch(&sample_messages()).await.unwrap();

        let persisted_message = message_repo.find_by_id("msg_1").await.unwrap().unwrap();
        let drafts = message_repo.find_drafts("acc_1").await.unwrap();

        assert_eq!(persisted_message.attachments.len(), 1);
        assert_eq!(
            persisted_message.attachments[0].local_path.as_deref(),
            Some(std::path::Path::new("cache/launch-plan.pdf"))
        );
        assert!(persisted_message.label_ids.is_empty());
        assert!(drafts.is_empty());

        account_repo.delete("acc_1").await.unwrap();

        assert!(account_repo.find_by_id("acc_1").await.unwrap().is_none());
        assert!(thread_repo.find_by_id("thr_1").await.unwrap().is_none());
        assert!(message_repo.find_by_id("msg_1").await.unwrap().is_none());
        assert!(folder_repo.find_by_account("acc_1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn persists_sync_cursors_by_account_and_folder() {
        let database_path = unique_database_path("open-mail-sync-cursor");
        let database = Database::new(&database_path).unwrap();
        database.run_migrations().unwrap();

        let account_repo = SqliteAccountRepository::new(database.clone());
        let folder_repo = SqliteFolderRepository::new(database.clone());
        let sync_cursor_repo = SqliteSyncCursorRepository::new(database.clone());

        account_repo.save(&sample_account()).await.unwrap();
        folder_repo
            .save(&sample_folder("fld_inbox", FolderRole::Inbox))
            .await
            .unwrap();

        let cursor = SyncCursor {
            account_id: "acc_1".into(),
            folder_id: "fld_inbox".into(),
            folder_path: "INBOX".into(),
            last_message_id: Some("msg_2".into()),
            last_message_observed_at: Some(sample_timestamp()),
            last_thread_id: Some("thr_1".into()),
            observed_message_count: 2,
            last_sync_started_at: Some(sample_timestamp()),
            last_sync_finished_at: Some(sample_timestamp()),
            updated_at: sample_timestamp(),
        };

        sync_cursor_repo.save(&cursor).await.unwrap();

        let persisted = sync_cursor_repo
            .find_by_folder("acc_1", "fld_inbox")
            .await
            .unwrap()
            .unwrap();
        let by_account = sync_cursor_repo.find_by_account("acc_1").await.unwrap();

        assert_eq!(persisted.folder_path, "INBOX");
        assert_eq!(persisted.last_message_id.as_deref(), Some("msg_2"));
        assert_eq!(persisted.observed_message_count, 2);
        assert_eq!(by_account.len(), 1);
    }
}
