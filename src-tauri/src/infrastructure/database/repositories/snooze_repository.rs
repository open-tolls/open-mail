use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};

use crate::{
    domain::{
        errors::DomainError,
        models::snooze::SnoozedThread,
        repositories::SnoozeRepository,
    },
    infrastructure::database::Database,
};

#[derive(Clone)]
pub struct SqliteSnoozeRepository {
    db: Database,
}

impl SqliteSnoozeRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl SnoozeRepository for SqliteSnoozeRepository {
    async fn find_by_thread_id(&self, thread_id: &str) -> Result<Option<SnoozedThread>, DomainError> {
        let connection = self.db.connection()?;
        connection
            .query_row(
                "SELECT id, thread_id, account_id, snooze_until, original_folder_id, created_at
                 FROM snoozed_threads
                 WHERE thread_id = ?1",
                params![thread_id],
                map_snooze,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn find_active_by_account(
        &self,
        account_id: &str,
        now: DateTime<Utc>,
    ) -> Result<Vec<SnoozedThread>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, thread_id, account_id, snooze_until, original_folder_id, created_at
                 FROM snoozed_threads
                 WHERE account_id = ?1 AND snooze_until > ?2
                 ORDER BY snooze_until ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let rows = statement
            .query_map(params![account_id, now.to_rfc3339()], map_snooze)
            .map_err(|error| DomainError::Database(error.to_string()))?;

        rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn save(&self, snooze: &SnoozedThread) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO snoozed_threads (id, thread_id, account_id, snooze_until, original_folder_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(thread_id) DO UPDATE SET
                    snooze_until = excluded.snooze_until,
                    original_folder_id = excluded.original_folder_id",
                params![
                    snooze.id,
                    snooze.thread_id,
                    snooze.account_id,
                    snooze.snooze_until.to_rfc3339(),
                    snooze.original_folder_id,
                    snooze.created_at.to_rfc3339()
                ],
            )
            .map(|_| ())
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn delete_by_thread_id(&self, thread_id: &str) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute("DELETE FROM snoozed_threads WHERE thread_id = ?1", params![thread_id])
            .map(|_| ())
            .map_err(|error| DomainError::Database(error.to_string()))
    }
}

fn map_snooze(row: &rusqlite::Row<'_>) -> rusqlite::Result<SnoozedThread> {
    Ok(SnoozedThread {
        id: row.get(0)?,
        thread_id: row.get(1)?,
        account_id: row.get(2)?,
        snooze_until: row
            .get::<_, String>(3)
            .and_then(|value| DateTime::parse_from_rfc3339(&value).map_err(to_from_sql_error))
            .map(|value| value.with_timezone(&Utc))?,
        original_folder_id: row.get(4)?,
        created_at: row
            .get::<_, String>(5)
            .and_then(|value| DateTime::parse_from_rfc3339(&value).map_err(to_from_sql_error))
            .map(|value| value.with_timezone(&Utc))?,
    })
}

fn to_from_sql_error(error: chrono::ParseError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(error),
    )
}
