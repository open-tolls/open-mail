use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, types::Type, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::scheduled_send::{ScheduledSend, ScheduledSendStatus},
        repositories::ScheduledSendRepository,
    },
    infrastructure::{database::Database, sync::MimeMessage},
};

#[derive(Clone)]
pub struct SqliteScheduledSendRepository {
    db: Database,
}

impl SqliteScheduledSendRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl ScheduledSendRepository for SqliteScheduledSendRepository {
    async fn find_by_id(&self, id: &str) -> Result<Option<ScheduledSend>, DomainError> {
        let connection = self.db.connection()?;
        connection
            .query_row(
                "SELECT id, account_id, mime_message_json, send_at, status, last_error, sent_at, created_at, updated_at
                 FROM scheduled_sends
                 WHERE id = ?1",
                params![id],
                map_scheduled_send,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn find_by_status(
        &self,
        account_id: &str,
        status: ScheduledSendStatus,
    ) -> Result<Vec<ScheduledSend>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, account_id, mime_message_json, send_at, status, last_error, sent_at, created_at, updated_at
                 FROM scheduled_sends
                 WHERE account_id = ?1 AND status = ?2
                 ORDER BY send_at ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let scheduled_sends = statement
            .query_map(
                params![account_id, status_to_string(&status)],
                map_scheduled_send,
            )
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(scheduled_sends)
    }

    async fn find_due(&self, now: DateTime<Utc>) -> Result<Vec<ScheduledSend>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, account_id, mime_message_json, send_at, status, last_error, sent_at, created_at, updated_at
                 FROM scheduled_sends
                 WHERE status = 'pending' AND send_at <= ?1
                 ORDER BY send_at ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let scheduled_sends = statement
            .query_map(params![now.to_rfc3339()], map_scheduled_send)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(scheduled_sends)
    }

    async fn save(&self, scheduled_send: &ScheduledSend) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO scheduled_sends (
                    id, account_id, mime_message_json, send_at, status, last_error, sent_at, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    mime_message_json = excluded.mime_message_json,
                    send_at = excluded.send_at,
                    status = excluded.status,
                    last_error = excluded.last_error,
                    sent_at = excluded.sent_at,
                    updated_at = excluded.updated_at",
                params![
                    scheduled_send.id,
                    scheduled_send.account_id,
                    serde_json::to_string(&scheduled_send.mime_message)
                        .map_err(|error| DomainError::Validation(error.to_string()))?,
                    scheduled_send.send_at.to_rfc3339(),
                    status_to_string(&scheduled_send.status),
                    scheduled_send.last_error,
                    scheduled_send.sent_at.map(|sent_at| sent_at.to_rfc3339()),
                    scheduled_send.created_at.to_rfc3339(),
                    scheduled_send.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }
}

fn map_scheduled_send(row: &Row<'_>) -> rusqlite::Result<ScheduledSend> {
    let mime_message_json: String = row.get(2)?;
    Ok(ScheduledSend {
        id: row.get(0)?,
        account_id: row.get(1)?,
        mime_message: serde_json::from_str::<MimeMessage>(&mime_message_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(2, Type::Text, Box::new(error))
        })?,
        send_at: parse_timestamp(&row.get::<_, String>(3)?),
        status: status_from_string(&row.get::<_, String>(4)?),
        last_error: row.get(5)?,
        sent_at: row
            .get::<_, Option<String>>(6)?
            .map(|timestamp| parse_timestamp(&timestamp)),
        created_at: parse_timestamp(&row.get::<_, String>(7)?),
        updated_at: parse_timestamp(&row.get::<_, String>(8)?),
    })
}

fn status_to_string(status: &ScheduledSendStatus) -> &'static str {
    match status {
        ScheduledSendStatus::Pending => "pending",
        ScheduledSendStatus::Sending => "sending",
        ScheduledSendStatus::Sent => "sent",
        ScheduledSendStatus::Failed => "failed",
        ScheduledSendStatus::Cancelled => "cancelled",
    }
}

fn status_from_string(value: &str) -> ScheduledSendStatus {
    match value {
        "sending" => ScheduledSendStatus::Sending,
        "sent" => ScheduledSendStatus::Sent,
        "failed" => ScheduledSendStatus::Failed,
        "cancelled" => ScheduledSendStatus::Cancelled,
        _ => ScheduledSendStatus::Pending,
    }
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
