use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::Duration,
};

use async_trait::async_trait;
use tokio::{
    sync::{watch, Mutex},
    task::JoinHandle,
};

use crate::domain::{
    events::DomainEvent,
    models::account::{Account, ConnectionSettings, SyncState},
    repositories::AccountRepository,
};

pub trait SyncEventEmitter: Send + Sync {
    fn emit(&self, event: &DomainEvent);
}

#[derive(Default)]
pub struct NoopSyncEventEmitter;

impl SyncEventEmitter for NoopSyncEventEmitter {
    fn emit(&self, _event: &DomainEvent) {}
}

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImapFolder {
    pub path: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdleResult {
    NewMessages,
    Timeout,
    Disconnected,
}

#[async_trait]
pub trait ImapClient: Send + Sync {
    async fn connect(
        &mut self,
        settings: &ConnectionSettings,
        credentials: &Credentials,
    ) -> Result<(), SyncError>;
    async fn list_folders(&mut self) -> Result<Vec<ImapFolder>, SyncError>;
    async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError>;
}

#[async_trait]
pub trait ImapClientFactory: Send + Sync {
    async fn create(&self, account: &Account) -> Result<Box<dyn ImapClient>, SyncError>;
}

#[derive(Default)]
pub struct FakeImapClientFactory;

struct FakeImapClient {
    account_id: String,
    connected: bool,
}

#[async_trait]
impl ImapClient for FakeImapClient {
    async fn connect(
        &mut self,
        settings: &ConnectionSettings,
        _credentials: &Credentials,
    ) -> Result<(), SyncError> {
        if settings.imap_host.trim().is_empty() {
            return Err(SyncError::Connection("imap host cannot be empty".into()));
        }

        self.connected = true;
        Ok(())
    }

    async fn list_folders(&mut self) -> Result<Vec<ImapFolder>, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        Ok(vec![
            ImapFolder {
                path: "INBOX".into(),
                display_name: format!("{} Inbox", self.account_id),
            },
            ImapFolder {
                path: "Archive".into(),
                display_name: "Archive".into(),
            },
        ])
    }

    async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError> {
        if !self.connected {
            return Err(SyncError::Connection("client is not connected".into()));
        }

        tokio::time::sleep(timeout).await;
        Ok(IdleResult::Timeout)
    }
}

#[async_trait]
impl ImapClientFactory for FakeImapClientFactory {
    async fn create(&self, account: &Account) -> Result<Box<dyn ImapClient>, SyncError> {
        Ok(Box::new(FakeImapClient {
            account_id: account.id.clone(),
            connected: false,
        }))
    }
}

struct SyncWorkerHandle {
    stop_tx: watch::Sender<bool>,
    join_handle: JoinHandle<()>,
}

pub struct SyncManager {
    account_repo: Arc<dyn AccountRepository>,
    emitter: RwLock<Arc<dyn SyncEventEmitter>>,
    imap_factory: RwLock<Arc<dyn ImapClientFactory>>,
    workers: Arc<Mutex<HashMap<String, SyncWorkerHandle>>>,
    statuses: Arc<Mutex<HashMap<String, SyncState>>>,
}

impl SyncManager {
    pub fn new(account_repo: Arc<dyn AccountRepository>) -> Self {
        Self {
            account_repo,
            emitter: RwLock::new(Arc::new(NoopSyncEventEmitter)),
            imap_factory: RwLock::new(Arc::new(FakeImapClientFactory)),
            workers: Arc::new(Mutex::new(HashMap::new())),
            statuses: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_event_emitter(&self, emitter: Arc<dyn SyncEventEmitter>) {
        if let Ok(mut current) = self.emitter.write() {
            *current = emitter;
        }
    }

    pub fn set_imap_factory(&self, factory: Arc<dyn ImapClientFactory>) {
        if let Ok(mut current) = self.imap_factory.write() {
            *current = factory;
        }
    }

    pub async fn start_sync(&self, account: Account) -> Result<(), SyncError> {
        let mut workers = self.workers.lock().await;
        if workers.contains_key(&account.id) {
            return Ok(());
        }

        let account_id = account.id.clone();
        let (stop_tx, mut stop_rx) = watch::channel(false);
        let worker = SyncWorker::new(
            account,
            self.account_repo.clone(),
            self.statuses.clone(),
            self.current_emitter(),
            self.current_imap_factory(),
        );

        let join_handle = tokio::spawn(async move {
            worker.run(&mut stop_rx).await;

            loop {
                if *stop_rx.borrow() {
                    break;
                }

                if stop_rx.changed().await.is_err() {
                    break;
                }

                if *stop_rx.borrow() {
                    break;
                }
            }
        });

        workers.insert(
            account_id,
            SyncWorkerHandle {
                stop_tx,
                join_handle,
            },
        );
        Ok(())
    }

    pub async fn stop_sync(&self, account_id: &str) -> Result<(), SyncError> {
        let handle = {
            let mut workers = self.workers.lock().await;
            workers.remove(account_id)
        };

        let Some(handle) = handle else {
            return Ok(());
        };

        handle
            .stop_tx
            .send(true)
            .map_err(|error| SyncError::Operation(error.to_string()))?;
        handle
            .join_handle
            .await
            .map_err(|error| SyncError::Join(error.to_string()))?;

        let Some(mut account) = self
            .account_repo
            .find_by_id(account_id)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?
        else {
            return Err(SyncError::AccountNotFound(account_id.to_string()));
        };

        update_sync_state(
            &self.account_repo,
            &self.statuses,
            &*self.current_emitter(),
            &mut account,
            SyncState::Sleeping,
        )
        .await;

        Ok(())
    }

    pub async fn stop_all(&self) -> Result<(), SyncError> {
        let account_ids = self.workers.lock().await.keys().cloned().collect::<Vec<_>>();

        for account_id in account_ids {
            self.stop_sync(&account_id).await?;
        }

        Ok(())
    }

    pub async fn status_snapshot(&self) -> HashMap<String, SyncState> {
        self.statuses.lock().await.clone()
    }

    pub async fn bootstrap_accounts(&self) -> Result<(), SyncError> {
        let accounts = self
            .account_repo
            .find_all()
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?;

        for account in accounts {
            self.start_sync(account).await?;
        }

        Ok(())
    }

    fn current_emitter(&self) -> Arc<dyn SyncEventEmitter> {
        self.emitter
            .read()
            .map(|emitter| emitter.clone())
            .unwrap_or_else(|_| Arc::new(NoopSyncEventEmitter))
    }

    fn current_imap_factory(&self) -> Arc<dyn ImapClientFactory> {
        self.imap_factory
            .read()
            .map(|factory| factory.clone())
            .unwrap_or_else(|_| Arc::new(FakeImapClientFactory))
    }
}

struct SyncWorker {
    account: Account,
    account_repo: Arc<dyn AccountRepository>,
    statuses: Arc<Mutex<HashMap<String, SyncState>>>,
    emitter: Arc<dyn SyncEventEmitter>,
    imap_factory: Arc<dyn ImapClientFactory>,
}

impl SyncWorker {
    fn new(
        account: Account,
        account_repo: Arc<dyn AccountRepository>,
        statuses: Arc<Mutex<HashMap<String, SyncState>>>,
        emitter: Arc<dyn SyncEventEmitter>,
        imap_factory: Arc<dyn ImapClientFactory>,
    ) -> Self {
        Self {
            account,
            account_repo,
            statuses,
            emitter,
            imap_factory,
        }
    }

    async fn run(mut self, stop_rx: &mut watch::Receiver<bool>) {
        update_sync_state(
            &self.account_repo,
            &self.statuses,
            &*self.emitter,
            &mut self.account,
            SyncState::Running,
        )
        .await;

        if self.sync_cycle().await.is_err() {
            update_sync_state(
                &self.account_repo,
                &self.statuses,
                &*self.emitter,
                &mut self.account,
                SyncState::Error("sync cycle failed".into()),
            )
            .await;
            return;
        }

        update_sync_state(
            &self.account_repo,
            &self.statuses,
            &*self.emitter,
            &mut self.account,
            SyncState::Sleeping,
        )
        .await;

        let _ = stop_rx.changed().await;
    }

    async fn sync_cycle(&self) -> Result<(), SyncError> {
        let mut client = self.imap_factory.create(&self.account).await?;
        let credentials = Credentials::Password {
            username: self.account.email_address.clone(),
            password: "demo-password".into(),
        };

        client
            .connect(&self.account.connection_settings, &credentials)
            .await?;
        let _folders = client.list_folders().await?;
        let _ = client.idle(Duration::from_millis(25)).await?;

        Ok(())
    }
}

async fn update_sync_state(
    account_repo: &Arc<dyn AccountRepository>,
    statuses: &Mutex<HashMap<String, SyncState>>,
    emitter: &dyn SyncEventEmitter,
    account: &mut Account,
    next_state: SyncState,
) {
    account.sync_state = next_state.clone();

    let _ = account_repo.save(account).await;
    statuses
        .lock()
        .await
        .insert(account.id.clone(), next_state.clone());
    emitter.emit(&DomainEvent::SyncStatusChanged {
        account_id: account.id.clone(),
        state: next_state,
    });
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex as StdMutex},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use super::{SyncEventEmitter, SyncManager};
    use crate::{
        domain::{
            events::DomainEvent,
            models::account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
            repositories::AccountRepository,
        },
        infrastructure::database::{
            repositories::account_repository::SqliteAccountRepository, Database,
        },
    };

    #[derive(Default)]
    struct RecordingEmitter {
        events: StdMutex<Vec<DomainEvent>>,
    }

    impl SyncEventEmitter for RecordingEmitter {
        fn emit(&self, event: &DomainEvent) {
            self.events.lock().unwrap().push(event.clone());
        }
    }

    fn sample_account() -> Account {
        let timestamp = chrono::DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Account {
            id: "acc_sync".into(),
            name: "Sync".into(),
            email_address: "sync@example.com".into(),
            provider: AccountProvider::Imap,
            connection_settings: ConnectionSettings {
                imap_host: "imap.example.com".into(),
                imap_port: 993,
                imap_security: SecurityType::Ssl,
                smtp_host: "smtp.example.com".into(),
                smtp_port: 587,
                smtp_security: SecurityType::StartTls,
            },
            sync_state: SyncState::NotStarted,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    async fn build_manager() -> (SyncManager, Arc<dyn AccountRepository>, Arc<RecordingEmitter>) {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let database_path = std::env::temp_dir().join(format!("open-mail-sync-{unique_suffix}.db"));
        let db = Database::new(&database_path).unwrap();
        db.run_migrations().unwrap();

        let account_repo: Arc<dyn AccountRepository> =
            Arc::new(SqliteAccountRepository::new(db.clone()));
        account_repo.save(&sample_account()).await.unwrap();

        let manager = SyncManager::new(account_repo.clone());
        let emitter = Arc::new(RecordingEmitter::default());
        manager.set_event_emitter(emitter.clone());

        (manager, account_repo, emitter)
    }

    #[tokio::test]
    async fn start_sync_updates_account_state_and_emits_events() {
        let (manager, account_repo, emitter) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;

        let persisted = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();
        let statuses = manager.status_snapshot().await;

        assert_eq!(persisted.sync_state, SyncState::Sleeping);
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::SyncStatusChanged { account_id, state }
                if account_id == "acc_sync" && *state == SyncState::Running
        )));
    }

    #[tokio::test]
    async fn stop_sync_cleans_up_worker_and_keeps_sleeping_state() {
        let (manager, account_repo, _) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;
        manager.stop_sync("acc_sync").await.unwrap();

        let statuses = manager.status_snapshot().await;
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
    }
}
