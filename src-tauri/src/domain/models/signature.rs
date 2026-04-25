use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::errors::DomainError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub id: String,
    pub title: String,
    pub body: String,
    pub account_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Signature {
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.id.trim().is_empty() {
            return Err(DomainError::Validation("signature id cannot be empty".into()));
        }

        if self.title.trim().is_empty() {
            return Err(DomainError::Validation(
                "signature title cannot be empty".into(),
            ));
        }

        if self.body.trim().is_empty() {
            return Err(DomainError::Validation(
                "signature body cannot be empty".into(),
            ));
        }

        Ok(())
    }
}
