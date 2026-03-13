use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::Duration,
};

use chrono::Utc;
use tokio::{
    sync::{watch, Mutex},
    task::JoinHandle,
};

use crate::domain::{
    events::DomainEvent,
    models::{account::{Account, SyncState}, folder::Folder},
    repositories::{AccountRepository, FolderRepository},
};

use super::{
    imap_client::{FakeImapClientFactory, IdleResult, SharedImapClientFactory},
    Credentials, SyncError, SyncFolderState, SyncPhase, SyncStatusSnapshot,
};

pub trait SyncEventEmitter: Send + Sync {
    fn emit(&self, event: &DomainEvent);
}

#[derive(Default)]
pub struct NoopSyncEventEmitter;

impl SyncEventEmitter for NoopSyncEventEmitter {
    fn emit(&self, _event: &DomainEvent) {}
}

struct SyncWorkerHandle {
    stop_tx: watch::Sender<bool>,
    join_handle: JoinHandle<()>,
}

pub struct SyncManager {
    account_repo: Arc<dyn AccountRepository>,
    folder_repo: Arc<dyn FolderRepository>,
    emitter: RwLock<Arc<dyn SyncEventEmitter>>,
    imap_factory: RwLock<SharedImapClientFactory>,
    workers: Arc<Mutex<HashMap<String, SyncWorkerHandle>>>,
    statuses: Arc<Mutex<HashMap<String, SyncStatusSnapshot>>>,
}

impl SyncManager {
    pub fn new(account_repo: Arc<dyn AccountRepository>, folder_repo: Arc<dyn FolderRepository>) -> Self {
        Self {
            account_repo,
            folder_repo,
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

    pub fn set_imap_factory(&self, factory: SharedImapClientFactory) {
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
            self.folder_repo.clone(),
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

        let snapshot = self
            .statuses
            .lock()
            .await
            .get(account_id)
            .cloned()
            .unwrap_or_else(|| SyncStatusSnapshot::from_state(SyncState::Sleeping));
        update_sync_status(
            &self.account_repo,
            &self.statuses,
            &*self.current_emitter(),
            &mut account,
            SyncStatusSnapshot {
                state: SyncState::Sleeping,
                phase: snapshot.phase,
                folders: snapshot.folders,
                folders_synced: snapshot.folders_synced,
                messages_observed: snapshot.messages_observed,
                last_sync_started_at: snapshot.last_sync_started_at,
                last_sync_finished_at: Some(Utc::now()),
                last_error: None,
            },
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

    pub async fn force_sync(&self, account_id: &str) -> Result<(), SyncError> {
        self.stop_sync(account_id).await?;

        let account = self
            .account_repo
            .find_by_id(account_id)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?
            .ok_or_else(|| SyncError::AccountNotFound(account_id.to_string()))?;

        self.start_sync(account).await
    }

    pub async fn status_snapshot(&self) -> HashMap<String, SyncState> {
        self.statuses
            .lock()
            .await
            .iter()
            .map(|(account_id, status)| (account_id.clone(), status.state.clone()))
            .collect()
    }

    pub async fn detailed_status_snapshot(&self) -> HashMap<String, SyncStatusSnapshot> {
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

    fn current_imap_factory(&self) -> SharedImapClientFactory {
        self.imap_factory
            .read()
            .map(|factory| factory.clone())
            .unwrap_or_else(|_| Arc::new(FakeImapClientFactory))
    }
}

struct SyncWorker {
    account: Account,
    account_repo: Arc<dyn AccountRepository>,
    folder_repo: Arc<dyn FolderRepository>,
    statuses: Arc<Mutex<HashMap<String, SyncStatusSnapshot>>>,
    emitter: Arc<dyn SyncEventEmitter>,
    imap_factory: SharedImapClientFactory,
}

impl SyncWorker {
    fn new(
        account: Account,
        account_repo: Arc<dyn AccountRepository>,
        folder_repo: Arc<dyn FolderRepository>,
        statuses: Arc<Mutex<HashMap<String, SyncStatusSnapshot>>>,
        emitter: Arc<dyn SyncEventEmitter>,
        imap_factory: SharedImapClientFactory,
    ) -> Self {
        Self {
            account,
            account_repo,
            folder_repo,
            statuses,
            emitter,
            imap_factory,
        }
    }

    async fn run(mut self, stop_rx: &mut watch::Receiver<bool>) {
        update_sync_status(
            &self.account_repo,
            &self.statuses,
            &*self.emitter,
            &mut self.account,
            SyncStatusSnapshot {
                state: SyncState::Running,
                phase: Some(SyncPhase::Connecting),
                folders: Vec::new(),
                folders_synced: 0,
                messages_observed: 0,
                last_sync_started_at: Some(Utc::now()),
                last_sync_finished_at: None,
                last_error: None,
            },
        )
        .await;

        if let Err(error) = self.sync_cycle().await {
            let started_at = current_started_at(&self.statuses, &self.account.id).await;
            update_sync_status(
                &self.account_repo,
                &self.statuses,
                &*self.emitter,
                &mut self.account,
                SyncStatusSnapshot {
                    state: SyncState::Error("sync cycle failed".into()),
                    phase: None,
                    folders: Vec::new(),
                    folders_synced: 0,
                    messages_observed: 0,
                    last_sync_started_at: started_at,
                    last_sync_finished_at: Some(Utc::now()),
                    last_error: Some(error.to_string()),
                },
            )
            .await;
            return;
        }

        let _ = stop_rx.changed().await;
    }

    async fn sync_cycle(&mut self) -> Result<(), SyncError> {
        let mut client = self.imap_factory.create(&self.account).await?;
        let credentials = Credentials::Password {
            username: self.account.email_address.clone(),
            password: "demo-password".into(),
        };

        client
            .connect(&self.account.connection_settings, &credentials)
            .await?;

        let started_at = current_started_at(&self.statuses, &self.account.id).await;
        let folders = client.list_folders().await?;
        update_sync_status(
            &self.account_repo,
            &self.statuses,
            &*self.emitter,
            &mut self.account,
            SyncStatusSnapshot {
                state: SyncState::Running,
                phase: Some(SyncPhase::DiscoveringFolders),
                folders: folders
                    .into_iter()
                    .map(|folder| SyncFolderState {
                        path: folder.path,
                        display_name: folder.display_name,
                        unread_count: 0,
                        total_count: 0,
                    })
                    .collect(),
                folders_synced: 0,
                messages_observed: 0,
                last_sync_started_at: started_at,
                last_sync_finished_at: None,
                last_error: None,
            },
        )
        .await;

        let folder_statuses = client.fetch_folder_statuses().await?;
        reconcile_folder_state(
            &self.folder_repo,
            &*self.emitter,
            &self.account.id,
            &folder_statuses,
        )
        .await?;
        let folders_synced = folder_statuses.len() as u32;
        update_sync_status(
            &self.account_repo,
            &self.statuses,
            &*self.emitter,
            &mut self.account,
            SyncStatusSnapshot {
                state: SyncState::Running,
                phase: Some(SyncPhase::SyncingFolders),
                folders: folder_statuses
                    .iter()
                    .map(|folder| SyncFolderState {
                        path: folder.folder.path.clone(),
                        display_name: folder.folder.display_name.clone(),
                        unread_count: folder.unread_count,
                        total_count: folder.total_count,
                    })
                    .collect(),
                folders_synced,
                messages_observed: 0,
                last_sync_started_at: started_at,
                last_sync_finished_at: None,
                last_error: None,
            },
        )
        .await;

        let idle_result = client.idle(Duration::from_millis(25)).await?;
        let messages_observed = match idle_result {
            IdleResult::NewMessages { count } => count,
            IdleResult::Timeout | IdleResult::Disconnected => 0,
        };
        update_sync_status(
            &self.account_repo,
            &self.statuses,
            &*self.emitter,
            &mut self.account,
            SyncStatusSnapshot {
                state: SyncState::Sleeping,
                phase: Some(SyncPhase::Idling),
                folders: folder_statuses
                    .into_iter()
                    .map(|folder| SyncFolderState {
                        path: folder.folder.path,
                        display_name: folder.folder.display_name,
                        unread_count: folder.unread_count,
                        total_count: folder.total_count,
                    })
                    .collect(),
                folders_synced,
                messages_observed,
                last_sync_started_at: started_at,
                last_sync_finished_at: Some(Utc::now()),
                last_error: None,
            },
        )
        .await;

        Ok(())
    }
}

async fn reconcile_folder_state(
    folder_repo: &Arc<dyn FolderRepository>,
    emitter: &dyn SyncEventEmitter,
    account_id: &str,
    observed_folders: &[crate::infrastructure::sync::ImapFolderStatus],
) -> Result<(), SyncError> {
    let persisted_folders = folder_repo
        .find_by_account(account_id)
        .await
        .map_err(|error| SyncError::Operation(error.to_string()))?;
    let mut changed_folders = Vec::new();

    for observed_folder in observed_folders {
        let Some(existing_folder) = persisted_folders
            .iter()
            .find(|folder| folder.path.eq_ignore_ascii_case(&observed_folder.folder.path))
        else {
            continue;
        };

        if existing_folder.unread_count == observed_folder.unread_count
            && existing_folder.total_count == observed_folder.total_count
        {
            continue;
        }

        let mut updated_folder: Folder = existing_folder.clone();
        updated_folder.unread_count = observed_folder.unread_count;
        updated_folder.total_count = observed_folder.total_count;
        updated_folder.updated_at = Utc::now();
        folder_repo
            .save(&updated_folder)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?;
        changed_folders.push(updated_folder.id);
    }

    if !changed_folders.is_empty() {
        emitter.emit(&DomainEvent::FoldersChanged {
            account_id: account_id.to_string(),
        });
    }

    Ok(())
}

async fn current_started_at(
    statuses: &Mutex<HashMap<String, SyncStatusSnapshot>>,
    account_id: &str,
) -> Option<chrono::DateTime<Utc>> {
    statuses
        .lock()
        .await
        .get(account_id)
        .and_then(|snapshot| snapshot.last_sync_started_at)
}

async fn update_sync_status(
    account_repo: &Arc<dyn AccountRepository>,
    statuses: &Mutex<HashMap<String, SyncStatusSnapshot>>,
    emitter: &dyn SyncEventEmitter,
    account: &mut Account,
    next_status: SyncStatusSnapshot,
) {
    account.sync_state = next_status.state.clone();

    let _ = account_repo.save(account).await;
    statuses
        .lock()
        .await
        .insert(account.id.clone(), next_status.clone());
    emitter.emit(&DomainEvent::SyncStatusChanged {
        account_id: account.id.clone(),
        state: next_status.state,
    });
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex as StdMutex},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use crate::{
        domain::{
            events::DomainEvent,
            models::account::{
                Account, AccountProvider, ConnectionSettings, SecurityType, SyncState,
            },
            models::folder::{Folder, FolderRole},
            repositories::{AccountRepository, FolderRepository},
        },
        infrastructure::database::{
            repositories::{
                account_repository::SqliteAccountRepository,
                folder_repository::SqliteFolderRepository,
            },
            Database,
        },
    };

    use super::{SyncEventEmitter, SyncManager};

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

    fn sample_folders() -> Vec<Folder> {
        let timestamp = chrono::DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        vec![
            Folder {
                id: "fld_inbox".into(),
                account_id: "acc_sync".into(),
                name: "Inbox".into(),
                path: "INBOX".into(),
                role: Some(FolderRole::Inbox),
                unread_count: 0,
                total_count: 0,
                created_at: timestamp,
                updated_at: timestamp,
            },
            Folder {
                id: "fld_archive".into(),
                account_id: "acc_sync".into(),
                name: "Archive".into(),
                path: "Archive".into(),
                role: Some(FolderRole::Archive),
                unread_count: 0,
                total_count: 0,
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]
    }

    async fn build_manager() -> (
        SyncManager,
        Arc<dyn AccountRepository>,
        Arc<dyn FolderRepository>,
        Arc<RecordingEmitter>,
    ) {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let database_path =
            std::env::temp_dir().join(format!("open-mail-sync-{unique_suffix}.db"));
        let db = Database::new(&database_path).unwrap();
        db.run_migrations().unwrap();

        let account_repo: Arc<dyn AccountRepository> =
            Arc::new(SqliteAccountRepository::new(db.clone()));
        let folder_repo: Arc<dyn FolderRepository> =
            Arc::new(SqliteFolderRepository::new(db.clone()));
        account_repo.save(&sample_account()).await.unwrap();
        folder_repo.save_batch(&sample_folders()).await.unwrap();

        let manager = SyncManager::new(account_repo.clone(), folder_repo.clone());
        let emitter = Arc::new(RecordingEmitter::default());
        manager.set_event_emitter(emitter.clone());

        (manager, account_repo, folder_repo, emitter)
    }

    #[tokio::test]
    async fn start_sync_updates_account_state_and_emits_events() {
        let (manager, account_repo, folder_repo, emitter) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;

        let persisted = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();
        let synced_folders = folder_repo.find_by_account("acc_sync").await.unwrap();
        let statuses = manager.status_snapshot().await;

        assert_eq!(persisted.sync_state, SyncState::Sleeping);
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
        assert_eq!(
            synced_folders
                .iter()
                .find(|folder| folder.id == "fld_inbox")
                .map(|folder| (folder.unread_count, folder.total_count)),
            Some((2, 12))
        );
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::SyncStatusChanged { account_id, state }
                if account_id == "acc_sync" && *state == SyncState::Running
        )));
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::FoldersChanged { account_id } if account_id == "acc_sync"
        )));
    }

    #[tokio::test]
    async fn stop_sync_cleans_up_worker_and_keeps_sleeping_state() {
        let (manager, account_repo, _, _) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;
        manager.stop_sync("acc_sync").await.unwrap();

        let statuses = manager.status_snapshot().await;
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
    }

    #[tokio::test]
    async fn force_sync_restarts_worker_and_preserves_sleeping_state() {
        let (manager, account_repo, _, _) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;
        manager.force_sync("acc_sync").await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;

        let statuses = manager.status_snapshot().await;
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
    }
}
