#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("account not found: {0}")]
    AccountNotFound(String),
    #[error("imap connection failed: {0}")]
    Connection(String),
    #[error("sync task join failed: {0}")]
    Join(String),
    #[error("sync operation failed: {0}")]
    Operation(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Credentials {
    Password { username: String, password: String },
    OAuth2 { username: String, access_token: String },
}
