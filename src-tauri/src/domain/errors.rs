use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("validation error: {0}")]
    Validation(String),
    #[error("entity not found: {entity_type} with id {id}")]
    NotFound { entity_type: String, id: String },
    #[error("duplicate entity: {0}")]
    Duplicate(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("sync error: {0}")]
    Sync(String),
    #[error("authentication error: {0}")]
    Auth(String),
    #[error("io error: {0}")]
    Io(String),
}

impl Serialize for DomainError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
