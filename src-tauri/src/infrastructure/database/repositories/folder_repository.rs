use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::folder::{Folder, FolderRole},
        repositories::FolderRepository,
    },
    infrastructure::database::Database,
};

#[derive(Clone)]
pub struct SqliteFolderRepository {
    db: Database,
}

impl SqliteFolderRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl FolderRepository for SqliteFolderRepository {
    async fn find_by_account(&self, account_id: &str) -> Result<Vec<Folder>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, account_id, name, path, role, unread_count, total_count, created_at, updated_at
                 FROM folders
                 WHERE account_id = ?1
                 ORDER BY name ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let folders = statement
            .query_map(params![account_id], map_folder)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(folders)
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<Folder>, DomainError> {
        let connection = self.db.connection()?;
        connection
            .query_row(
                "SELECT id, account_id, name, path, role, unread_count, total_count, created_at, updated_at
                 FROM folders WHERE id = ?1",
                params![id],
                map_folder,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn find_by_role(
        &self,
        account_id: &str,
        role: FolderRole,
    ) -> Result<Option<Folder>, DomainError> {
        let connection = self.db.connection()?;
        connection
            .query_row(
                "SELECT id, account_id, name, path, role, unread_count, total_count, created_at, updated_at
                 FROM folders WHERE account_id = ?1 AND role = ?2",
                params![account_id, role.to_string()],
                map_folder,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn save(&self, folder: &Folder) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO folders (
                    id, account_id, name, path, role, unread_count, total_count, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    path = excluded.path,
                    role = excluded.role,
                    unread_count = excluded.unread_count,
                    total_count = excluded.total_count,
                    updated_at = excluded.updated_at",
                params![
                    folder.id,
                    folder.account_id,
                    folder.name,
                    folder.path,
                    folder.role.as_ref().map(ToString::to_string),
                    folder.unread_count,
                    folder.total_count,
                    folder.created_at.to_rfc3339(),
                    folder.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }

    async fn save_batch(&self, folders: &[Folder]) -> Result<(), DomainError> {
        for folder in folders {
            self.save(folder).await?;
        }

        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute("DELETE FROM folders WHERE id = ?1", params![id])
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }
}

fn map_folder(row: &Row<'_>) -> rusqlite::Result<Folder> {
    let role = row
        .get::<_, Option<String>>(4)?
        .and_then(|value| match value.as_str() {
            "inbox" => Some(FolderRole::Inbox),
            "sent" => Some(FolderRole::Sent),
            "drafts" => Some(FolderRole::Drafts),
            "trash" => Some(FolderRole::Trash),
            "spam" => Some(FolderRole::Spam),
            "archive" => Some(FolderRole::Archive),
            "all" => Some(FolderRole::All),
            "starred" => Some(FolderRole::Starred),
            "important" => Some(FolderRole::Important),
            _ => None,
        });

    Ok(Folder {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        path: row.get(3)?,
        role,
        unread_count: row.get(5)?,
        total_count: row.get(6)?,
        created_at: parse_timestamp(&row.get::<_, String>(7)?),
        updated_at: parse_timestamp(&row.get::<_, String>(8)?),
    })
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
