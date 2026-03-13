use std::fmt::{Display, Formatter};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::errors::DomainError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub email_address: String,
    pub provider: AccountProvider,
    pub connection_settings: ConnectionSettings,
    pub sync_state: SyncState,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AccountProvider {
    Gmail,
    Outlook,
    Yahoo,
    Imap,
    Exchange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConnectionSettings {
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_security: SecurityType,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_security: SecurityType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SecurityType {
    Ssl,
    StartTls,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SyncState {
    NotStarted,
    Running,
    Sleeping,
    Error(String),
}

impl Account {
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.id.trim().is_empty() {
            return Err(DomainError::Validation("account id cannot be empty".into()));
        }

        if self.name.trim().is_empty() {
            return Err(DomainError::Validation(
                "account name cannot be empty".into(),
            ));
        }

        if !self.email_address.contains('@') {
            return Err(DomainError::Validation(
                "account email must be valid".into(),
            ));
        }

        self.connection_settings.validate()
    }
}

impl ConnectionSettings {
    pub fn validate(&self) -> Result<(), DomainError> {
        let has_invalid_host = self.imap_host.trim().is_empty() || self.smtp_host.trim().is_empty();
        if has_invalid_host {
            return Err(DomainError::Validation(
                "connection hosts cannot be empty".into(),
            ));
        }

        if self.imap_port == 0 || self.smtp_port == 0 {
            return Err(DomainError::Validation(
                "connection ports must be greater than zero".into(),
            ));
        }

        Ok(())
    }
}

impl Display for AccountProvider {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let provider = match self {
            Self::Gmail => "gmail",
            Self::Outlook => "outlook",
            Self::Yahoo => "yahoo",
            Self::Imap => "imap",
            Self::Exchange => "exchange",
        };

        write!(f, "{provider}")
    }
}

impl Display for SecurityType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let security_type = match self {
            Self::Ssl => "ssl",
            Self::StartTls => "starttls",
            Self::None => "none",
        };

        write!(f, "{security_type}")
    }
}

impl Display for SyncState {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotStarted => write!(f, "not-started"),
            Self::Running => write!(f, "running"),
            Self::Sleeping => write!(f, "sleeping"),
            Self::Error(message) => write!(f, "error:{message}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::*;

    fn sample_account() -> Account {
        let timestamp = DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        Account {
            id: "acc_1".into(),
            name: "Personal".into(),
            email_address: "leco@example.com".into(),
            provider: AccountProvider::Imap,
            connection_settings: ConnectionSettings {
                imap_host: "imap.example.com".into(),
                imap_port: 993,
                imap_security: SecurityType::Ssl,
                smtp_host: "smtp.example.com".into(),
                smtp_port: 587,
                smtp_security: SecurityType::StartTls,
            },
            sync_state: SyncState::Running,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    #[test]
    fn validates_account_connection_settings() {
        assert!(sample_account().validate().is_ok());
    }

    #[test]
    fn rejects_invalid_email() {
        let mut account = sample_account();
        account.email_address = "invalid".into();

        assert!(matches!(
            account.validate(),
            Err(DomainError::Validation(_))
        ));
    }

    #[test]
    fn serializes_account_to_json() {
        let json = serde_json::to_string(&sample_account()).unwrap();

        assert!(json.contains("\"email_address\":\"leco@example.com\""));
        assert!(json.contains("\"provider\":\"Imap\""));
    }
}
