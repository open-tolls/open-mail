pub mod imap_client;
pub mod sync_manager;
pub mod types;

pub use imap_client::{
    FakeImapClientFactory, IdleResult, ImapClient, ImapClientFactory, ImapFolder,
};
pub use sync_manager::{NoopSyncEventEmitter, SyncEventEmitter, SyncManager};
pub use types::{Credentials, SyncError};
