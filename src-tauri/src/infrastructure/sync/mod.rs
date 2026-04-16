pub mod imap_client;
pub mod smtp_client;
pub mod sync_manager;
pub mod types;

pub use imap_client::{
    FakeImapClientFactory, IdleResult, ImapClient, ImapClientFactory, ImapEnvelope, ImapFolder,
    ImapFolderStatus,
};
pub use smtp_client::{
    FakeSmtpClient, MailAddress, MimeAttachment, MimeMessage, SmtpClient, SmtpSendReceipt,
};
pub use sync_manager::{NoopSyncEventEmitter, SyncEventEmitter, SyncManager};
pub use types::{
    Credentials, SyncError, SyncFolderState, SyncMessageObservation, SyncPhase,
    SyncStatusSnapshot,
};
