use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
        repositories::AccountRepository,
    },
    infrastructure::database::Database,
};

#[derive(Clone)]
pub struct SqliteAccountRepository {
    db: Database,
}

impl SqliteAccountRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl AccountRepository for SqliteAccountRepository {
    async fn find_all(&self) -> Result<Vec<Account>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, email_address, provider, connection_settings_json, sync_state, created_at, updated_at
                 FROM accounts
                 ORDER BY created_at ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let accounts = statement
            .query_map([], map_account)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(accounts)
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<Account>, DomainError> {
        let connection = self.db.connection()?;
        let account = connection
            .query_row(
                "SELECT id, name, email_address, provider, connection_settings_json, sync_state, created_at, updated_at
                 FROM accounts
                 WHERE id = ?1",
                params![id],
                map_account,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(account)
    }

    async fn save(&self, account: &Account) -> Result<(), DomainError> {
        account.validate()?;

        let connection = self.db.connection()?;
        let settings_json = serde_json::to_string(&account.connection_settings)
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        connection
            .execute(
                "INSERT INTO accounts (
                    id, name, email_address, provider, connection_settings_json, sync_state, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    email_address = excluded.email_address,
                    provider = excluded.provider,
                    connection_settings_json = excluded.connection_settings_json,
                    sync_state = excluded.sync_state,
                    updated_at = excluded.updated_at",
                params![
                    account.id,
                    account.name,
                    account.email_address,
                    account.provider.to_string(),
                    settings_json,
                    account.sync_state.to_string(),
                    account.created_at.to_rfc3339(),
                    account.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute("DELETE FROM accounts WHERE id = ?1", params![id])
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }
}

fn map_account(row: &Row<'_>) -> rusqlite::Result<Account> {
    let provider = match row.get::<_, String>(3)?.as_str() {
        "gmail" => AccountProvider::Gmail,
        "outlook" => AccountProvider::Outlook,
        "yahoo" => AccountProvider::Yahoo,
        "exchange" => AccountProvider::Exchange,
        _ => AccountProvider::Imap,
    };

    let sync_state = match row.get::<_, String>(5)?.as_str() {
        "running" => SyncState::Running,
        "sleeping" => SyncState::Sleeping,
        state if state.starts_with("error:") => {
            SyncState::Error(state.trim_start_matches("error:").to_string())
        }
        _ => SyncState::NotStarted,
    };

    let connection_settings = serde_json::from_str::<ConnectionSettings>(&row.get::<_, String>(4)?)
        .unwrap_or(ConnectionSettings {
            imap_host: "imap.example.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.example.com".into(),
            smtp_port: 587,
            smtp_security: SecurityType::StartTls,
        });

    Ok(Account {
        id: row.get(0)?,
        name: row.get(1)?,
        email_address: row.get(2)?,
        provider,
        connection_settings,
        sync_state,
        created_at: parse_timestamp(&row.get::<_, String>(6)?),
        updated_at: parse_timestamp(&row.get::<_, String>(7)?),
    })
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
