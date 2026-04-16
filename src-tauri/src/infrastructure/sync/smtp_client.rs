use async_trait::async_trait;

use crate::domain::models::account::ConnectionSettings;

use super::{Credentials, SyncError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MailAddress {
    pub name: Option<String>,
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MimeAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
    pub is_inline: bool,
    pub content_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MimeMessage {
    pub from: MailAddress,
    pub to: Vec<MailAddress>,
    pub cc: Vec<MailAddress>,
    pub bcc: Vec<MailAddress>,
    pub reply_to: Option<MailAddress>,
    pub subject: String,
    pub html_body: String,
    pub plain_body: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub attachments: Vec<MimeAttachment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SmtpSendReceipt {
    pub accepted_recipients: usize,
}

#[async_trait]
pub trait SmtpClient: Send + Sync {
    async fn test_connection(
        &mut self,
        settings: &ConnectionSettings,
        credentials: &Credentials,
    ) -> Result<(), SyncError>;

    async fn send(
        &mut self,
        settings: &ConnectionSettings,
        credentials: &Credentials,
        message: &MimeMessage,
    ) -> Result<SmtpSendReceipt, SyncError>;
}

#[derive(Debug, Default)]
pub struct FakeSmtpClient {
    sent_messages: Vec<MimeMessage>,
}

impl FakeSmtpClient {
    pub fn sent_count(&self) -> usize {
        self.sent_messages.len()
    }
}

#[async_trait]
impl SmtpClient for FakeSmtpClient {
    async fn test_connection(
        &mut self,
        settings: &ConnectionSettings,
        credentials: &Credentials,
    ) -> Result<(), SyncError> {
        validate_smtp_settings(settings)?;
        validate_credentials(credentials)?;
        Ok(())
    }

    async fn send(
        &mut self,
        settings: &ConnectionSettings,
        credentials: &Credentials,
        message: &MimeMessage,
    ) -> Result<SmtpSendReceipt, SyncError> {
        self.test_connection(settings, credentials).await?;
        validate_message(message)?;

        let accepted_recipients = message.to.len() + message.cc.len() + message.bcc.len();
        self.sent_messages.push(message.clone());

        Ok(SmtpSendReceipt {
            accepted_recipients,
        })
    }
}

fn validate_smtp_settings(settings: &ConnectionSettings) -> Result<(), SyncError> {
    if settings.smtp_host.trim().is_empty() {
        return Err(SyncError::Connection("smtp host cannot be empty".into()));
    }

    if settings.smtp_port == 0 {
        return Err(SyncError::Connection("smtp port cannot be zero".into()));
    }

    Ok(())
}

fn validate_credentials(credentials: &Credentials) -> Result<(), SyncError> {
    let (username, secret) = match credentials {
        Credentials::Password { username, password } => (username, password),
        Credentials::OAuth2 {
            username,
            access_token,
        } => (username, access_token),
    };

    if username.trim().is_empty() || secret.trim().is_empty() {
        return Err(SyncError::Connection(
            "smtp credentials cannot be empty".into(),
        ));
    }

    Ok(())
}

fn validate_message(message: &MimeMessage) -> Result<(), SyncError> {
    if message.from.email.trim().is_empty() {
        return Err(SyncError::Operation(
            "mime message sender cannot be empty".into(),
        ));
    }

    if message.to.is_empty() && message.cc.is_empty() && message.bcc.is_empty() {
        return Err(SyncError::Operation(
            "mime message must have at least one recipient".into(),
        ));
    }

    if message.subject.trim().is_empty() {
        return Err(SyncError::Operation(
            "mime message subject cannot be empty".into(),
        ));
    }

    if message.html_body.trim().is_empty()
        && message
            .plain_body
            .as_deref()
            .is_none_or(|plain_body| plain_body.trim().is_empty())
    {
        return Err(SyncError::Operation(
            "mime message body cannot be empty".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::domain::models::account::SecurityType;

    use super::*;

    fn settings() -> ConnectionSettings {
        ConnectionSettings {
            imap_host: "imap.example.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.example.com".into(),
            smtp_port: 587,
            smtp_security: SecurityType::StartTls,
        }
    }

    fn credentials() -> Credentials {
        Credentials::Password {
            username: "leco@example.com".into(),
            password: "demo-password".into(),
        }
    }

    fn address(email: &str) -> MailAddress {
        MailAddress {
            name: None,
            email: email.into(),
        }
    }

    fn message() -> MimeMessage {
        MimeMessage {
            from: address("leco@example.com"),
            to: vec![address("team@example.com")],
            cc: vec![],
            bcc: vec![],
            reply_to: None,
            subject: "Open Mail sync update".into(),
            html_body: "<p>Sync is ready.</p>".into(),
            plain_body: Some("Sync is ready.".into()),
            in_reply_to: None,
            references: vec![],
            attachments: vec![MimeAttachment {
                filename: "report.txt".into(),
                content_type: "text/plain".into(),
                data: b"ready".to_vec(),
                is_inline: false,
                content_id: None,
            }],
        }
    }

    #[tokio::test]
    async fn fake_smtp_client_sends_valid_mime_messages() {
        let mut client = FakeSmtpClient::default();
        let receipt = client
            .send(&settings(), &credentials(), &message())
            .await
            .unwrap();

        assert_eq!(receipt.accepted_recipients, 1);
        assert_eq!(client.sent_count(), 1);
    }

    #[tokio::test]
    async fn fake_smtp_client_rejects_messages_without_recipients() {
        let mut message = message();
        message.to.clear();

        let error = FakeSmtpClient::default()
            .send(&settings(), &credentials(), &message)
            .await
            .unwrap_err();

        assert!(error.to_string().contains("recipient"));
    }
}
