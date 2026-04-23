use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{errors::DomainError, models::thread::Thread, repositories::ThreadRepository},
    infrastructure::database::{
        repositories::message_repository::SqliteMessageRepository, Database,
    },
};

#[derive(Clone)]
pub struct SqliteThreadRepository {
    db: Database,
}

impl SqliteThreadRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    fn hydrate_thread(&self, mut thread: Thread) -> Result<Thread, DomainError> {
        let connection = self.db.connection()?;
        thread.folder_ids =
            fetch_related_ids(&connection, "thread_folders", "folder_id", &thread.id)?;
        thread.label_ids = fetch_related_ids(&connection, "thread_labels", "label_id", &thread.id)?;
        drop(connection);

        let message_repository = SqliteMessageRepository::new(self.db.clone());
        let messages = message_repository.find_by_thread_sync(&thread.id)?;
        thread.participant_ids = collect_unique(messages.iter().flat_map(|message| {
            message
                .from
                .iter()
                .chain(message.to.iter())
                .chain(message.cc.iter())
                .chain(message.bcc.iter())
                .map(|contact| contact.email.clone())
        }));

        Ok(thread)
    }

    fn hydrate_threads(&self, threads: Vec<Thread>) -> Result<Vec<Thread>, DomainError> {
        threads
            .into_iter()
            .map(|thread| self.hydrate_thread(thread))
            .collect()
    }

    async fn find_by_flag(
        &self,
        account_id: &str,
        column: &str,
    ) -> Result<Vec<Thread>, DomainError> {
        let query = format!(
            "SELECT id, account_id, subject, snippet, message_count, has_attachments, is_unread, is_starred, last_message_at, last_message_sent_at, created_at, updated_at
             FROM threads WHERE account_id = ?1 AND {column} = 1 ORDER BY last_message_at DESC"
        );
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(&query)
            .map_err(|error| DomainError::Database(error.to_string()))?;
        let threads = statement
            .query_map(params![account_id], map_thread)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;
        drop(statement);
        drop(connection);

        self.hydrate_threads(threads)
    }
}

#[async_trait]
impl ThreadRepository for SqliteThreadRepository {
    async fn find_by_id(&self, id: &str) -> Result<Option<Thread>, DomainError> {
        let connection = self.db.connection()?;
        let thread = connection
            .query_row(
                "SELECT id, account_id, subject, snippet, message_count, has_attachments, is_unread, is_starred, last_message_at, last_message_sent_at, created_at, updated_at
                 FROM threads WHERE id = ?1",
                params![id],
                map_thread,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))?;
        drop(connection);

        match thread {
            Some(thread) => self.hydrate_thread(thread).map(Some),
            None => Ok(None),
        }
    }

    async fn find_by_folder(
        &self,
        account_id: &str,
        folder_id: &str,
        offset: u32,
        limit: u32,
    ) -> Result<Vec<Thread>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT t.id, t.account_id, t.subject, t.snippet, t.message_count, t.has_attachments, t.is_unread, t.is_starred, t.last_message_at, t.last_message_sent_at, t.created_at, t.updated_at
                 FROM threads t
                 INNER JOIN thread_folders tf ON tf.thread_id = t.id
                 WHERE t.account_id = ?1 AND tf.folder_id = ?2
                 ORDER BY t.last_message_at DESC
                 LIMIT ?3 OFFSET ?4",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let threads = statement
            .query_map(params![account_id, folder_id, limit, offset], map_thread)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;
        drop(statement);
        drop(connection);

        self.hydrate_threads(threads)
    }

    async fn find_unread(&self, account_id: &str) -> Result<Vec<Thread>, DomainError> {
        self.find_by_flag(account_id, "is_unread").await
    }

    async fn find_starred(&self, account_id: &str) -> Result<Vec<Thread>, DomainError> {
        self.find_by_flag(account_id, "is_starred").await
    }

    async fn search(&self, account_id: &str, query: &str) -> Result<Vec<Thread>, DomainError> {
        let connection = self.db.connection()?;
        let threads = if query.trim().is_empty() {
            let mut statement = connection
                .prepare(
                    "SELECT id, account_id, subject, snippet, message_count, has_attachments, is_unread, is_starred, last_message_at, last_message_sent_at, created_at, updated_at
                     FROM threads
                     WHERE account_id = ?1
                     ORDER BY last_message_at DESC",
                )
                .map_err(|error| DomainError::Database(error.to_string()))?;

            let threads = statement
                .query_map(params![account_id], map_thread)
                .map_err(|error| DomainError::Database(error.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| DomainError::Database(error.to_string()))?;
            threads
        } else {
            let mut statement = connection
                .prepare(
                    "SELECT t.id, t.account_id, t.subject, t.snippet, t.message_count, t.has_attachments, t.is_unread, t.is_starred, t.last_message_at, t.last_message_sent_at, t.created_at, t.updated_at
                     FROM threads t
                     INNER JOIN (
                        SELECT m.thread_id, MAX(m.date) AS last_match_at
                        FROM messages_fts mf
                        INNER JOIN messages m ON m.rowid = mf.rowid
                        WHERE m.account_id = ?1 AND messages_fts MATCH ?2
                        GROUP BY m.thread_id
                     ) matches ON matches.thread_id = t.id
                     WHERE t.account_id = ?1
                     ORDER BY matches.last_match_at DESC, t.last_message_at DESC",
                )
                .map_err(|error| DomainError::Database(error.to_string()))?;

            let threads = statement
                .query_map(params![account_id, query], map_thread)
                .map_err(|error| DomainError::Database(error.to_string()))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| DomainError::Database(error.to_string()))?;
            threads
        };
        drop(connection);

        self.hydrate_threads(threads)
    }

    async fn save(&self, thread: &Thread) -> Result<(), DomainError> {
        let mut connection = self.db.connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        transaction
            .execute(
                "INSERT INTO threads (
                    id, account_id, subject, snippet, message_count, has_attachments, is_unread, is_starred, last_message_at, last_message_sent_at, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(id) DO UPDATE SET
                    subject = excluded.subject,
                    snippet = excluded.snippet,
                    message_count = excluded.message_count,
                    has_attachments = excluded.has_attachments,
                    is_unread = excluded.is_unread,
                    is_starred = excluded.is_starred,
                    last_message_at = excluded.last_message_at,
                    last_message_sent_at = excluded.last_message_sent_at,
                    updated_at = excluded.updated_at",
                params![
                    thread.id,
                    thread.account_id,
                    thread.subject,
                    thread.snippet,
                    thread.message_count,
                    thread.has_attachments,
                    thread.is_unread,
                    thread.is_starred,
                    thread.last_message_at.to_rfc3339(),
                    thread.last_message_sent_at.map(|timestamp| timestamp.to_rfc3339()),
                    thread.created_at.to_rfc3339(),
                    thread.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        transaction
            .execute(
                "DELETE FROM thread_folders WHERE thread_id = ?1",
                params![thread.id],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        transaction
            .execute(
                "DELETE FROM thread_labels WHERE thread_id = ?1",
                params![thread.id],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        for folder_id in &thread.folder_ids {
            transaction
                .execute(
                    "INSERT INTO thread_folders (thread_id, folder_id) VALUES (?1, ?2)",
                    params![thread.id, folder_id],
                )
                .map_err(|error| DomainError::Database(error.to_string()))?;
        }

        for label_id in &thread.label_ids {
            transaction
                .execute(
                    "INSERT INTO thread_labels (thread_id, label_id) VALUES (?1, ?2)",
                    params![thread.id, label_id],
                )
                .map_err(|error| DomainError::Database(error.to_string()))?;
        }

        transaction
            .commit()
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }

    async fn save_batch(&self, threads: &[Thread]) -> Result<(), DomainError> {
        for thread in threads {
            self.save(thread).await?;
        }
        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute("DELETE FROM threads WHERE id = ?1", params![id])
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }

    async fn count_by_folder(&self, account_id: &str, folder_id: &str) -> Result<u32, DomainError> {
        let connection = self.db.connection()?;
        let count = connection
            .query_row(
                "SELECT COUNT(*)
                 FROM threads t
                 INNER JOIN thread_folders tf ON tf.thread_id = t.id
                 WHERE t.account_id = ?1 AND tf.folder_id = ?2",
                params![account_id, folder_id],
                |row| row.get::<_, u32>(0),
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(count)
    }

    async fn count_unread_by_folder(
        &self,
        account_id: &str,
        folder_id: &str,
    ) -> Result<u32, DomainError> {
        let connection = self.db.connection()?;
        let count = connection
            .query_row(
                "SELECT COUNT(*)
                 FROM threads t
                 INNER JOIN thread_folders tf ON tf.thread_id = t.id
                 WHERE t.account_id = ?1 AND tf.folder_id = ?2 AND t.is_unread = 1",
                params![account_id, folder_id],
                |row| row.get::<_, u32>(0),
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(count)
    }
}

fn fetch_related_ids(
    connection: &rusqlite::Connection,
    table: &str,
    value_column: &str,
    thread_id: &str,
) -> Result<Vec<String>, DomainError> {
    let query = format!(
        "SELECT {value_column} FROM {table} WHERE thread_id = ?1 ORDER BY {value_column} ASC"
    );
    let mut statement = connection
        .prepare(&query)
        .map_err(|error| DomainError::Database(error.to_string()))?;
    let ids = statement
        .query_map(params![thread_id], |row| row.get::<_, String>(0))
        .map_err(|error| DomainError::Database(error.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| DomainError::Database(error.to_string()))?;

    Ok(ids)
}

fn collect_unique(values: impl Iterator<Item = String>) -> Vec<String> {
    let mut unique_values = Vec::new();

    for value in values {
        if !unique_values.contains(&value) {
            unique_values.push(value);
        }
    }

    unique_values
}

fn map_thread(row: &Row<'_>) -> rusqlite::Result<Thread> {
    Ok(Thread {
        id: row.get(0)?,
        account_id: row.get(1)?,
        subject: row.get(2)?,
        snippet: row.get(3)?,
        message_count: row.get(4)?,
        participant_ids: vec![],
        folder_ids: vec![],
        label_ids: vec![],
        has_attachments: row.get(5)?,
        is_unread: row.get(6)?,
        is_starred: row.get(7)?,
        last_message_at: parse_timestamp(&row.get::<_, String>(8)?),
        last_message_sent_at: row
            .get::<_, Option<String>>(9)?
            .map(|timestamp| parse_timestamp(&timestamp)),
        created_at: parse_timestamp(&row.get::<_, String>(10)?),
        updated_at: parse_timestamp(&row.get::<_, String>(11)?),
    })
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
