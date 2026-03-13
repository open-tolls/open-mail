use std::{collections::HashMap, path::PathBuf};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::{attachment::Attachment, contact::Contact, message::Message},
        repositories::MessageRepository,
    },
    infrastructure::database::Database,
};

#[derive(Clone)]
pub struct SqliteMessageRepository {
    db: Database,
}

impl SqliteMessageRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub(crate) fn find_by_thread_sync(&self, thread_id: &str) -> Result<Vec<Message>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, account_id, thread_id, folder_id, subject, snippet, body, plain_text, from_json, to_json, cc_json, bcc_json, reply_to_json, message_id_header, in_reply_to, references_json, is_unread, is_starred, is_draft, date, headers_json, created_at, updated_at
                 FROM messages
                 WHERE thread_id = ?1
                 ORDER BY date ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let messages = statement
            .query_map(params![thread_id], map_message_row)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let mut hydrated = Vec::with_capacity(messages.len());
        for mut message in messages {
            message.attachments = self.find_attachments_sync(&message.id)?;
            message.label_ids = self.find_message_labels_sync(&message.id)?;
            hydrated.push(message);
        }

        Ok(hydrated)
    }

    pub(crate) fn find_by_id_sync(&self, id: &str) -> Result<Option<Message>, DomainError> {
        let connection = self.db.connection()?;
        let message = connection
            .query_row(
                "SELECT id, account_id, thread_id, folder_id, subject, snippet, body, plain_text, from_json, to_json, cc_json, bcc_json, reply_to_json, message_id_header, in_reply_to, references_json, is_unread, is_starred, is_draft, date, headers_json, created_at, updated_at
                 FROM messages
                 WHERE id = ?1",
                params![id],
                map_message_row,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        match message {
            Some(mut message) => {
                message.attachments = self.find_attachments_sync(&message.id)?;
                message.label_ids = self.find_message_labels_sync(&message.id)?;
                Ok(Some(message))
            }
            None => Ok(None),
        }
    }

    fn find_attachments_sync(&self, message_id: &str) -> Result<Vec<Attachment>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, message_id, filename, content_type, size, content_id, is_inline, local_path
                 FROM attachments
                 WHERE message_id = ?1
                 ORDER BY filename ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let attachments = statement
            .query_map(params![message_id], |row| {
                let local_path = row.get::<_, Option<String>>(7)?.map(PathBuf::from);

                Ok(Attachment {
                    id: row.get(0)?,
                    message_id: row.get(1)?,
                    filename: row.get(2)?,
                    content_type: row.get(3)?,
                    size: row.get(4)?,
                    content_id: row.get(5)?,
                    is_inline: row.get(6)?,
                    local_path,
                })
            })
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(attachments)
    }

    fn find_message_labels_sync(&self, message_id: &str) -> Result<Vec<String>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT label_id
                 FROM message_labels
                 WHERE message_id = ?1
                 ORDER BY label_id ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let labels = statement
            .query_map(params![message_id], |row| row.get::<_, String>(0))
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(labels)
    }
}

#[async_trait]
impl MessageRepository for SqliteMessageRepository {
    async fn find_by_id(&self, id: &str) -> Result<Option<Message>, DomainError> {
        self.find_by_id_sync(id)
    }

    async fn find_by_thread(&self, thread_id: &str) -> Result<Vec<Message>, DomainError> {
        self.find_by_thread_sync(thread_id)
    }

    async fn find_drafts(&self, account_id: &str) -> Result<Vec<Message>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, account_id, thread_id, folder_id, subject, snippet, body, plain_text, from_json, to_json, cc_json, bcc_json, reply_to_json, message_id_header, in_reply_to, references_json, is_unread, is_starred, is_draft, date, headers_json, created_at, updated_at
                 FROM messages
                 WHERE account_id = ?1 AND is_draft = 1
                 ORDER BY date DESC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let messages = statement
            .query_map(params![account_id], map_message_row)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(messages)
    }

    async fn save(&self, message: &Message) -> Result<(), DomainError> {
        let mut connection = self.db.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        transaction
            .execute(
                "INSERT INTO messages (
                    id, account_id, thread_id, folder_id, subject, snippet, body, plain_text, from_json, to_json, cc_json, bcc_json, reply_to_json, message_id_header, in_reply_to, references_json, is_unread, is_starred, is_draft, date, headers_json, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
                 ON CONFLICT(id) DO UPDATE SET
                    folder_id = excluded.folder_id,
                    subject = excluded.subject,
                    snippet = excluded.snippet,
                    body = excluded.body,
                    plain_text = excluded.plain_text,
                    from_json = excluded.from_json,
                    to_json = excluded.to_json,
                    cc_json = excluded.cc_json,
                    bcc_json = excluded.bcc_json,
                    reply_to_json = excluded.reply_to_json,
                    in_reply_to = excluded.in_reply_to,
                    references_json = excluded.references_json,
                    is_unread = excluded.is_unread,
                    is_starred = excluded.is_starred,
                    is_draft = excluded.is_draft,
                    date = excluded.date,
                    headers_json = excluded.headers_json,
                    updated_at = excluded.updated_at",
                params![
                    message.id,
                    message.account_id,
                    message.thread_id,
                    message.folder_id,
                    message.subject,
                    message.snippet,
                    message.body,
                    message.plain_text,
                    serde_json::to_string(&message.from).map_err(|error| DomainError::Validation(error.to_string()))?,
                    serde_json::to_string(&message.to).map_err(|error| DomainError::Validation(error.to_string()))?,
                    serde_json::to_string(&message.cc).map_err(|error| DomainError::Validation(error.to_string()))?,
                    serde_json::to_string(&message.bcc).map_err(|error| DomainError::Validation(error.to_string()))?,
                    serde_json::to_string(&message.reply_to).map_err(|error| DomainError::Validation(error.to_string()))?,
                    message.message_id_header,
                    message.in_reply_to,
                    serde_json::to_string(&message.references).map_err(|error| DomainError::Validation(error.to_string()))?,
                    message.is_unread,
                    message.is_starred,
                    message.is_draft,
                    message.date.to_rfc3339(),
                    serde_json::to_string(&message.headers).map_err(|error| DomainError::Validation(error.to_string()))?,
                    message.created_at.to_rfc3339(),
                    message.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        transaction
            .execute(
                "DELETE FROM attachments WHERE message_id = ?1",
                params![message.id],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        transaction
            .execute(
                "DELETE FROM message_labels WHERE message_id = ?1",
                params![message.id],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        for attachment in &message.attachments {
            transaction
                .execute(
                    "INSERT INTO attachments (id, message_id, filename, content_type, size, content_id, is_inline, local_path)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        attachment.id,
                        attachment.message_id,
                        attachment.filename,
                        attachment.content_type,
                        attachment.size,
                        attachment.content_id,
                        attachment.is_inline,
                        attachment
                            .local_path
                            .as_ref()
                            .map(|path| path.to_string_lossy().to_string()),
                    ],
                )
                .map_err(|error| DomainError::Database(error.to_string()))?;
        }

        for label_id in &message.label_ids {
            transaction
                .execute(
                    "INSERT INTO message_labels (message_id, label_id) VALUES (?1, ?2)",
                    params![message.id, label_id],
                )
                .map_err(|error| DomainError::Database(error.to_string()))?;
        }

        transaction
            .commit()
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }

    async fn save_batch(&self, messages: &[Message]) -> Result<(), DomainError> {
        for message in messages {
            self.save(message).await?;
        }
        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute("DELETE FROM messages WHERE id = ?1", params![id])
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }
}

fn map_message_row(row: &Row<'_>) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        account_id: row.get(1)?,
        thread_id: row.get(2)?,
        folder_id: row.get(3)?,
        subject: row.get(4)?,
        snippet: row.get(5)?,
        body: row.get(6)?,
        plain_text: row.get(7)?,
        from: parse_contacts(&row.get::<_, String>(8)?),
        to: parse_contacts(&row.get::<_, String>(9)?),
        cc: parse_contacts(&row.get::<_, String>(10)?),
        bcc: parse_contacts(&row.get::<_, String>(11)?),
        reply_to: parse_contacts(&row.get::<_, String>(12)?),
        message_id_header: row.get(13)?,
        in_reply_to: row.get(14)?,
        references: serde_json::from_str(&row.get::<_, String>(15)?).unwrap_or_default(),
        label_ids: vec![],
        is_unread: row.get(16)?,
        is_starred: row.get(17)?,
        is_draft: row.get(18)?,
        date: parse_timestamp(&row.get::<_, String>(19)?),
        attachments: vec![],
        headers: serde_json::from_str(&row.get::<_, String>(20)?)
            .unwrap_or_else(|_| HashMap::new()),
        created_at: parse_timestamp(&row.get::<_, String>(21)?),
        updated_at: parse_timestamp(&row.get::<_, String>(22)?),
    })
}

fn parse_contacts(value: &str) -> Vec<Contact> {
    serde_json::from_str(value).unwrap_or_default()
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
