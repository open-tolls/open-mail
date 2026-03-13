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
    models::{
        account::{Account, SyncState},
        folder::Folder,
        sync_cursor::SyncCursor,
    },
    repositories::{
        AccountRepository, FolderRepository, MessageRepository, SyncCursorRepository,
        ThreadRepository,
    },
};

use super::{
    imap_client::{FakeImapClientFactory, IdleResult, SharedImapClientFactory},
    Credentials, SyncError, SyncFolderState, SyncMessageObservation, SyncPhase,
    SyncStatusSnapshot,
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
    thread_repo: Arc<dyn ThreadRepository>,
    message_repo: Arc<dyn MessageRepository>,
    sync_cursor_repo: Arc<dyn SyncCursorRepository>,
    emitter: RwLock<Arc<dyn SyncEventEmitter>>,
    imap_factory: RwLock<SharedImapClientFactory>,
    workers: Arc<Mutex<HashMap<String, SyncWorkerHandle>>>,
    statuses: Arc<Mutex<HashMap<String, SyncStatusSnapshot>>>,
}

impl SyncManager {
    pub fn new(
        account_repo: Arc<dyn AccountRepository>,
        folder_repo: Arc<dyn FolderRepository>,
        thread_repo: Arc<dyn ThreadRepository>,
        message_repo: Arc<dyn MessageRepository>,
        sync_cursor_repo: Arc<dyn SyncCursorRepository>,
    ) -> Self {
        Self {
            account_repo,
            folder_repo,
            thread_repo,
            message_repo,
            sync_cursor_repo,
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
        let worker = SyncWorker {
            account,
            account_repo: self.account_repo.clone(),
            folder_repo: self.folder_repo.clone(),
            thread_repo: self.thread_repo.clone(),
            message_repo: self.message_repo.clone(),
            sync_cursor_repo: self.sync_cursor_repo.clone(),
            statuses: self.statuses.clone(),
            emitter: self.current_emitter(),
            imap_factory: self.current_imap_factory(),
        };

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
    thread_repo: Arc<dyn ThreadRepository>,
    message_repo: Arc<dyn MessageRepository>,
    sync_cursor_repo: Arc<dyn SyncCursorRepository>,
    statuses: Arc<Mutex<HashMap<String, SyncStatusSnapshot>>>,
    emitter: Arc<dyn SyncEventEmitter>,
    imap_factory: SharedImapClientFactory,
}

impl SyncWorker {
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
        let observed_messages = match idle_result {
            IdleResult::NewMessages { .. } => {
                let cursors = self
                    .sync_cursor_repo
                    .find_by_account(&self.account.id)
                    .await
                    .map_err(|error| SyncError::Operation(error.to_string()))?;
                let observations = client.fetch_message_observations(&cursors).await?;
                let context = SyncObservationContext {
                    message_repo: &self.message_repo,
                    thread_repo: &self.thread_repo,
                    folder_repo: &self.folder_repo,
                    sync_cursor_repo: &self.sync_cursor_repo,
                    emitter: &*self.emitter,
                    account_id: &self.account.id,
                    sync_started_at: started_at,
                };
                apply_message_observations(&context, observations).await?
            }
            IdleResult::Timeout | IdleResult::Disconnected => Vec::new(),
        };
        let messages_observed = match idle_result {
            IdleResult::NewMessages { .. } => observed_messages.len() as u32,
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

struct SyncObservationContext<'a> {
    message_repo: &'a Arc<dyn MessageRepository>,
    thread_repo: &'a Arc<dyn ThreadRepository>,
    folder_repo: &'a Arc<dyn FolderRepository>,
    sync_cursor_repo: &'a Arc<dyn SyncCursorRepository>,
    emitter: &'a dyn SyncEventEmitter,
    account_id: &'a str,
    sync_started_at: Option<chrono::DateTime<Utc>>,
}

async fn apply_message_observations(
    context: &SyncObservationContext<'_>,
    observations: Vec<SyncMessageObservation>,
) -> Result<Vec<String>, SyncError> {
    let persisted_folders = context
        .folder_repo
        .find_by_account(context.account_id)
        .await
        .map_err(|error| SyncError::Operation(error.to_string()))?;
    let mut changed_message_ids = Vec::new();
    let mut changed_thread_ids = Vec::new();

    for observation in observations {
        let Some(mut message) = context
            .message_repo
            .find_by_id(&observation.message_id)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?
        else {
            continue;
        };

        if message.account_id != context.account_id {
            continue;
        }

        let folder_id = persisted_folders
            .iter()
            .find(|folder| folder.path.eq_ignore_ascii_case(&observation.folder_path))
            .map(|folder| folder.id.clone())
            .unwrap_or_else(|| message.folder_id.clone());

        message.folder_id = folder_id;
        message.subject = observation.subject.clone();
        message.snippet = observation.snippet.clone();
        message.body = format!("<p>{}</p>", observation.plain_text.as_deref().unwrap_or(&observation.snippet));
        message.plain_text = observation.plain_text.clone();
        message.is_unread = observation.is_unread;
        message.date = observation.observed_at;
        message.updated_at = observation.observed_at;
        for (key, value) in observation.headers {
            message.headers.insert(key, value);
        }

        context
            .message_repo
            .save(&message)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?;
        changed_message_ids.push(message.id.clone());

        let Some(mut thread) = context
            .thread_repo
            .find_by_id(&observation.thread_id)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?
        else {
            continue;
        };

        let thread_messages = context
            .message_repo
            .find_by_thread(&thread.id)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?;
        thread.update_from_messages(&thread_messages);
        thread.updated_at = Utc::now();
        context
            .thread_repo
            .save(&thread)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?;

        if !changed_thread_ids.contains(&thread.id) {
            changed_thread_ids.push(thread.id.clone());
        }

        let cursor = SyncCursor {
            account_id: context.account_id.to_string(),
            folder_id: message.folder_id.clone(),
            folder_path: observation.folder_path,
            last_message_id: Some(message.id.clone()),
            last_message_observed_at: Some(message.date),
            last_thread_id: Some(thread.id.clone()),
            observed_message_count: changed_message_ids.len() as u32,
            last_sync_started_at: context.sync_started_at,
            last_sync_finished_at: Some(Utc::now()),
            updated_at: Utc::now(),
        };
        context
            .sync_cursor_repo
            .save(&cursor)
            .await
            .map_err(|error| SyncError::Operation(error.to_string()))?;
    }

    if !changed_message_ids.is_empty() {
        context.emitter.emit(&DomainEvent::MessagesChanged {
            account_id: context.account_id.to_string(),
            message_ids: changed_message_ids.clone(),
        });
    }

    if !changed_thread_ids.is_empty() {
        context.emitter.emit(&DomainEvent::ThreadsChanged {
            account_id: context.account_id.to_string(),
            thread_ids: changed_thread_ids,
        });
    }

    Ok(changed_message_ids)
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
        sync::atomic::{AtomicU64, Ordering},
        sync::{Arc, Mutex as StdMutex},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use crate::{
        domain::{
            events::DomainEvent,
            models::account::{
                Account, AccountProvider, ConnectionSettings, SecurityType, SyncState,
            },
            models::{
                attachment::Attachment,
                contact::Contact,
                message::Message,
                thread::Thread,
            },
            models::folder::{Folder, FolderRole},
            repositories::{
                AccountRepository, FolderRepository, MessageRepository, SyncCursorRepository,
                ThreadRepository,
            },
        },
        infrastructure::database::{
            repositories::{
                account_repository::SqliteAccountRepository,
                folder_repository::SqliteFolderRepository,
                message_repository::SqliteMessageRepository,
                sync_cursor_repository::SqliteSyncCursorRepository,
                thread_repository::SqliteThreadRepository,
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

    fn sample_contact(
        id: &str,
        account_id: &str,
        name: &str,
        email: &str,
        is_me: bool,
    ) -> Contact {
        let timestamp = chrono::DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        Contact {
            id: id.into(),
            account_id: account_id.into(),
            name: Some(name.into()),
            email: email.into(),
            is_me,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    fn sample_threads() -> Vec<Thread> {
        let timestamp = chrono::DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        vec![
            Thread {
                id: "thr_1".into(),
                account_id: "acc_sync".into(),
                subject: "Premium motion system approved".into(),
                snippet: "Original snippet".into(),
                message_count: 1,
                participant_ids: vec!["atlas@example.com".into()],
                folder_ids: vec!["fld_inbox".into()],
                label_ids: vec![],
                has_attachments: true,
                is_unread: true,
                is_starred: false,
                last_message_at: timestamp,
                last_message_sent_at: Some(timestamp),
                created_at: timestamp,
                updated_at: timestamp,
            },
            Thread {
                id: "thr_2".into(),
                account_id: "acc_sync".into(),
                subject: "Rust health-check online".into(),
                snippet: "Original sync snippet".into(),
                message_count: 1,
                participant_ids: vec!["infra@example.com".into()],
                folder_ids: vec!["fld_archive".into()],
                label_ids: vec![],
                has_attachments: false,
                is_unread: false,
                is_starred: true,
                last_message_at: timestamp,
                last_message_sent_at: Some(timestamp),
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]
    }

    fn sample_messages() -> Vec<Message> {
        let timestamp = chrono::DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);

        vec![
            Message {
                id: "msg_1".into(),
                account_id: "acc_sync".into(),
                thread_id: "thr_1".into(),
                from: vec![sample_contact(
                    "ct_atlas",
                    "acc_sync",
                    "Atlas Design",
                    "atlas@example.com",
                    false,
                )],
                to: vec![],
                cc: vec![],
                bcc: vec![],
                reply_to: vec![],
                subject: "Premium motion system approved".into(),
                snippet: "Original snippet".into(),
                body: "<p>Original snippet</p>".into(),
                plain_text: Some("Original snippet".into()),
                message_id_header: "<msg_1@openmail.dev>".into(),
                in_reply_to: None,
                references: vec![],
                folder_id: "fld_inbox".into(),
                label_ids: vec![],
                is_unread: true,
                is_starred: false,
                is_draft: false,
                date: timestamp,
                attachments: vec![Attachment {
                    id: "att_1".into(),
                    message_id: "msg_1".into(),
                    filename: "motion-notes.pdf".into(),
                    content_type: "application/pdf".into(),
                    size: 2048,
                    content_id: None,
                    is_inline: false,
                    local_path: None,
                }],
                headers: std::collections::HashMap::new(),
                created_at: timestamp,
                updated_at: timestamp,
            },
            Message {
                id: "msg_2".into(),
                account_id: "acc_sync".into(),
                thread_id: "thr_2".into(),
                from: vec![sample_contact(
                    "ct_infra",
                    "acc_sync",
                    "Infra Sync",
                    "infra@example.com",
                    false,
                )],
                to: vec![],
                cc: vec![],
                bcc: vec![],
                reply_to: vec![],
                subject: "Rust health-check online".into(),
                snippet: "Original sync snippet".into(),
                body: "<p>Original sync snippet</p>".into(),
                plain_text: Some("Original sync snippet".into()),
                message_id_header: "<msg_2@openmail.dev>".into(),
                in_reply_to: None,
                references: vec![],
                folder_id: "fld_archive".into(),
                label_ids: vec![],
                is_unread: false,
                is_starred: true,
                is_draft: false,
                date: timestamp,
                attachments: vec![],
                headers: std::collections::HashMap::new(),
                created_at: timestamp,
                updated_at: timestamp,
            },
        ]
    }

    async fn build_manager() -> (
        SyncManager,
        Arc<dyn AccountRepository>,
        Arc<dyn FolderRepository>,
        Arc<dyn ThreadRepository>,
        Arc<dyn MessageRepository>,
        Arc<dyn SyncCursorRepository>,
        Arc<RecordingEmitter>,
    ) {
        static NEXT_DB_ID: AtomicU64 = AtomicU64::new(1);
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = NEXT_DB_ID.fetch_add(1, Ordering::Relaxed);
        let database_path =
            std::env::temp_dir().join(format!(
                "open-mail-sync-{}-{unique_suffix}-{counter}.db",
                std::process::id()
            ));
        let db = Database::new(&database_path).unwrap();
        db.run_migrations().unwrap();

        let account_repo: Arc<dyn AccountRepository> =
            Arc::new(SqliteAccountRepository::new(db.clone()));
        let folder_repo: Arc<dyn FolderRepository> =
            Arc::new(SqliteFolderRepository::new(db.clone()));
        let thread_repo: Arc<dyn ThreadRepository> =
            Arc::new(SqliteThreadRepository::new(db.clone()));
        let message_repo: Arc<dyn MessageRepository> =
            Arc::new(SqliteMessageRepository::new(db.clone()));
        let sync_cursor_repo: Arc<dyn SyncCursorRepository> =
            Arc::new(SqliteSyncCursorRepository::new(db.clone()));
        account_repo.save(&sample_account()).await.unwrap();
        folder_repo.save_batch(&sample_folders()).await.unwrap();
        thread_repo.save_batch(&sample_threads()).await.unwrap();
        message_repo.save_batch(&sample_messages()).await.unwrap();

        let manager = SyncManager::new(
            account_repo.clone(),
            folder_repo.clone(),
            thread_repo.clone(),
            message_repo.clone(),
            sync_cursor_repo.clone(),
        );
        let emitter = Arc::new(RecordingEmitter::default());
        manager.set_event_emitter(emitter.clone());

        (
            manager,
            account_repo,
            folder_repo,
            thread_repo,
            message_repo,
            sync_cursor_repo,
            emitter,
        )
    }

    #[tokio::test]
    async fn start_sync_updates_account_state_and_emits_events() {
        let (
            manager,
            account_repo,
            folder_repo,
            thread_repo,
            message_repo,
            sync_cursor_repo,
            emitter,
        ) =
            build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;

        let persisted = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();
        let synced_folders = folder_repo.find_by_account("acc_sync").await.unwrap();
        let synced_thread = thread_repo.find_by_id("thr_1").await.unwrap().unwrap();
        let synced_message = message_repo.find_by_id("msg_1").await.unwrap().unwrap();
        let synced_cursor = sync_cursor_repo
            .find_by_folder("acc_sync", "fld_inbox")
            .await
            .unwrap()
            .unwrap();
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
        assert!(synced_thread.snippet.contains("Sync confirmado"));
        assert!(synced_message.headers.contains_key("x-open-mail-sync"));
        assert_eq!(synced_cursor.last_message_id.as_deref(), Some("msg_1"));
        assert_eq!(synced_cursor.last_thread_id.as_deref(), Some("thr_1"));
        assert_eq!(synced_cursor.observed_message_count, 1);
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::SyncStatusChanged { account_id, state }
                if account_id == "acc_sync" && *state == SyncState::Running
        )));
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::FoldersChanged { account_id } if account_id == "acc_sync"
        )));
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::MessagesChanged { account_id, message_ids }
                if account_id == "acc_sync" && message_ids.contains(&"msg_1".to_string())
        )));
        assert!(emitter.events.lock().unwrap().iter().any(|event| matches!(
            event,
            DomainEvent::ThreadsChanged { account_id, thread_ids }
                if account_id == "acc_sync" && thread_ids.contains(&"thr_1".to_string())
        )));
    }

    #[tokio::test]
    async fn stop_sync_cleans_up_worker_and_keeps_sleeping_state() {
        let (manager, account_repo, _, _, _, _, _) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;
        manager.stop_sync("acc_sync").await.unwrap();

        let statuses = manager.status_snapshot().await;
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
    }

    #[tokio::test]
    async fn force_sync_restarts_worker_and_preserves_sleeping_state() {
        let (manager, account_repo, _, _, _, sync_cursor_repo, emitter) = build_manager().await;
        let account = account_repo.find_by_id("acc_sync").await.unwrap().unwrap();

        manager.start_sync(account).await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;
        let initial_message_events = emitter
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|event| matches!(event, DomainEvent::MessagesChanged { .. }))
            .count();
        let initial_cursor = sync_cursor_repo
            .find_by_folder("acc_sync", "fld_inbox")
            .await
            .unwrap()
            .unwrap();
        manager.force_sync("acc_sync").await.unwrap();
        tokio::time::sleep(Duration::from_millis(60)).await;

        let statuses = manager.status_snapshot().await;
        let final_message_events = emitter
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|event| matches!(event, DomainEvent::MessagesChanged { .. }))
            .count();
        let final_cursor = sync_cursor_repo
            .find_by_folder("acc_sync", "fld_inbox")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(statuses.get("acc_sync"), Some(&SyncState::Sleeping));
        assert_eq!(initial_message_events, final_message_events);
        assert_eq!(initial_cursor.last_message_id, final_cursor.last_message_id);
        assert_eq!(
            initial_cursor.observed_message_count,
            final_cursor.observed_message_count
        );
    }
}
