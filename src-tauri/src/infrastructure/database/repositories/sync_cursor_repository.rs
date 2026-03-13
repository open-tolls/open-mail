use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::sync_cursor::SyncCursor,
        repositories::SyncCursorRepository,
    },
    infrastructure::database::Database,
};

#[derive(Clone)]
pub struct SqliteSyncCursorRepository {
    db: Database,
}

impl SqliteSyncCursorRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl SyncCursorRepository for SqliteSyncCursorRepository {
    async fn find_by_account(&self, account_id: &str) -> Result<Vec<SyncCursor>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT account_id, folder_id, folder_path, uid_validity, last_seen_uid,
                        last_message_id, last_message_observed_at, last_thread_id,
                        observed_message_count, last_sync_started_at, last_sync_finished_at, updated_at
                 FROM sync_cursors
                 WHERE account_id = ?1
                 ORDER BY folder_path ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let cursors = statement
            .query_map(params![account_id], map_sync_cursor)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;
        drop(statement);
        drop(connection);

        Ok(cursors)
    }

    async fn find_by_folder(
        &self,
        account_id: &str,
        folder_id: &str,
    ) -> Result<Option<SyncCursor>, DomainError> {
        let connection = self.db.connection()?;
        connection
            .query_row(
                "SELECT account_id, folder_id, folder_path, uid_validity, last_seen_uid,
                        last_message_id, last_message_observed_at, last_thread_id,
                        observed_message_count, last_sync_started_at, last_sync_finished_at, updated_at
                 FROM sync_cursors
                 WHERE account_id = ?1 AND folder_id = ?2",
                params![account_id, folder_id],
                map_sync_cursor,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn save(&self, cursor: &SyncCursor) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO sync_cursors (
                    account_id, folder_id, folder_path, uid_validity, last_seen_uid,
                    last_message_id, last_message_observed_at, last_thread_id,
                    observed_message_count, last_sync_started_at, last_sync_finished_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(account_id, folder_id) DO UPDATE SET
                    folder_path = excluded.folder_path,
                    uid_validity = excluded.uid_validity,
                    last_seen_uid = excluded.last_seen_uid,
                    last_message_id = excluded.last_message_id,
                    last_message_observed_at = excluded.last_message_observed_at,
                    last_thread_id = excluded.last_thread_id,
                    observed_message_count = excluded.observed_message_count,
                    last_sync_started_at = excluded.last_sync_started_at,
                    last_sync_finished_at = excluded.last_sync_finished_at,
                    updated_at = excluded.updated_at",
                params![
                    cursor.account_id,
                    cursor.folder_id,
                    cursor.folder_path,
                    cursor.uid_validity,
                    cursor.last_seen_uid,
                    cursor.last_message_id,
                    cursor
                        .last_message_observed_at
                        .map(|value| value.to_rfc3339()),
                    cursor.last_thread_id,
                    cursor.observed_message_count,
                    cursor.last_sync_started_at.map(|value| value.to_rfc3339()),
                    cursor.last_sync_finished_at.map(|value| value.to_rfc3339()),
                    cursor.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }
}

fn map_sync_cursor(row: &Row<'_>) -> rusqlite::Result<SyncCursor> {
    Ok(SyncCursor {
        account_id: row.get(0)?,
        folder_id: row.get(1)?,
        folder_path: row.get(2)?,
        uid_validity: row.get(3)?,
        last_seen_uid: row.get(4)?,
        last_message_id: row.get(5)?,
        last_message_observed_at: row
            .get::<_, Option<String>>(6)?
            .map(|value| parse_timestamp(&value)),
        last_thread_id: row.get(7)?,
        observed_message_count: row.get(8)?,
        last_sync_started_at: row
            .get::<_, Option<String>>(9)?
            .map(|value| parse_timestamp(&value)),
        last_sync_finished_at: row
            .get::<_, Option<String>>(10)?
            .map(|value| parse_timestamp(&value)),
        updated_at: parse_timestamp(&row.get::<_, String>(11)?),
    })
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
