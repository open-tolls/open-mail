use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use rusqlite::Connection;

use crate::domain::errors::DomainError;

const INITIAL_MIGRATION: &str = include_str!("migrations/001_initial_schema.sql");

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
    use std::time::{SystemTime, UNIX_EPOCH};

    use chrono::{DateTime, Utc};

    use super::{repositories::account_repository::SqliteAccountRepository, Database};
    use crate::domain::{
        models::account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
        repositories::AccountRepository,
    };

    #[test]
    fn creates_database_and_runs_migrations() {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let database_path = std::env::temp_dir().join(format!("open-mail-{unique_suffix}.db"));
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
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let database_path =
            std::env::temp_dir().join(format!("open-mail-account-{unique_suffix}.db"));
        let database = Database::new(&database_path).unwrap();
        database.run_migrations().unwrap();
        let repository = SqliteAccountRepository::new(database.clone());
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        let account = Account {
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
        };

        repository.save(&account).await.unwrap();

        let persisted = repository.find_by_id("acc_1").await.unwrap().unwrap();
        assert_eq!(persisted.email_address, "leco@example.com");
    }
}
