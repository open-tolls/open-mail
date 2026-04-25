use std::collections::HashMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::signature::Signature,
        repositories::SignatureRepository,
    },
    infrastructure::database::Database,
};

const GLOBAL_SIGNATURE_SCOPE: &str = "global";

#[derive(Clone)]
pub struct SqliteSignatureRepository {
    db: Database,
}

impl SqliteSignatureRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl SignatureRepository for SqliteSignatureRepository {
    async fn find_all(&self) -> Result<Vec<Signature>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT id, title, body, account_id, created_at, updated_at
                 FROM signatures
                 ORDER BY created_at ASC",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let signatures = statement
            .query_map([], map_signature)
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(signatures)
    }

    async fn find_default_global(&self) -> Result<Option<String>, DomainError> {
        let connection = self.db.connection()?;
        connection
            .query_row(
                "SELECT signature_id
                 FROM signature_defaults
                 WHERE scope_key = ?1",
                params![GLOBAL_SIGNATURE_SCOPE],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(|result| result.flatten())
            .map_err(|error| DomainError::Database(error.to_string()))
    }

    async fn find_defaults_by_account(&self) -> Result<HashMap<String, Option<String>>, DomainError> {
        let connection = self.db.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT scope_key, signature_id
                 FROM signature_defaults
                 WHERE scope_key <> ?1",
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        let entries = statement
            .query_map(params![GLOBAL_SIGNATURE_SCOPE], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|error| DomainError::Database(error.to_string()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(entries.into_iter().collect())
    }

    async fn save(&self, signature: &Signature) -> Result<(), DomainError> {
        signature.validate()?;

        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO signatures (id, title, body, account_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    body = excluded.body,
                    account_id = excluded.account_id,
                    updated_at = excluded.updated_at",
                params![
                    signature.id,
                    signature.title,
                    signature.body,
                    signature.account_id,
                    signature.created_at.to_rfc3339(),
                    signature.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute("DELETE FROM signatures WHERE id = ?1", params![id])
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }

    async fn set_default(
        &self,
        signature_id: Option<&str>,
        account_id: Option<&str>,
    ) -> Result<(), DomainError> {
        let scope_key = account_id.unwrap_or(GLOBAL_SIGNATURE_SCOPE);
        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO signature_defaults (scope_key, signature_id)
                 VALUES (?1, ?2)
                 ON CONFLICT(scope_key) DO UPDATE SET
                    signature_id = excluded.signature_id",
                params![scope_key, signature_id],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;
        Ok(())
    }
}

fn map_signature(row: &Row<'_>) -> rusqlite::Result<Signature> {
    Ok(Signature {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        account_id: row.get(3)?,
        created_at: parse_timestamp(&row.get::<_, String>(4)?),
        updated_at: parse_timestamp(&row.get::<_, String>(5)?),
    })
}

fn parse_timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}
