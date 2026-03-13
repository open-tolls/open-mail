use tauri::State;

use crate::{
    domain::models::{
        account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
        folder::{Folder, FolderRole},
        message::Message,
        thread::Thread,
    },
    domain::read_models::{MailboxOverview, ThreadSummary},
    infrastructure::sync::SyncError,
    AppState,
};

async fn list_accounts_for_state(state: &AppState) -> Result<Vec<Account>, String> {
    state
        .account_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())
}

async fn list_folders_for_state(state: &AppState, account_id: &str) -> Result<Vec<Folder>, String> {
    state
        .folder_repo
        .find_by_account(account_id)
        .await
        .map_err(|error| error.to_string())
}

async fn list_threads_for_state(
    state: &AppState,
    account_id: &str,
    folder_id: &str,
    offset: u32,
    limit: u32,
) -> Result<Vec<ThreadSummary>, String> {
    state
        .thread_repo
        .find_by_folder(account_id, folder_id, offset, limit)
        .await
        .map(|threads| threads.into_iter().map(ThreadSummary::from).collect())
        .map_err(|error| error.to_string())
}

async fn search_threads_for_state(
    state: &AppState,
    account_id: &str,
    query: &str,
) -> Result<Vec<ThreadSummary>, String> {
    let trimmed_query = query.trim();
    if trimmed_query.is_empty() {
        return Ok(Vec::new());
    }

    state
        .thread_repo
        .search(account_id, trimmed_query)
        .await
        .map(|threads| threads.into_iter().map(ThreadSummary::from).collect())
        .map_err(|error| error.to_string())
}

async fn list_messages_for_state(state: &AppState, thread_id: &str) -> Result<Vec<Message>, String> {
    state
        .message_repo
        .find_by_thread(thread_id)
        .await
        .map_err(|error| error.to_string())
}

async fn get_message_for_state(
    state: &AppState,
    message_id: &str,
) -> Result<Option<Message>, String> {
    state
        .message_repo
        .find_by_id(message_id)
        .await
        .map_err(|error| error.to_string())
}

async fn start_sync_for_state(state: &AppState, account_id: &str) -> Result<(), String> {
    let account = state
        .account_repo
        .find_by_id(account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| SyncError::AccountNotFound(account_id.to_string()).to_string())?;

    state
        .sync_manager
        .start_sync(account)
        .await
        .map_err(|error| error.to_string())
}

async fn stop_sync_for_state(state: &AppState, account_id: &str) -> Result<(), String> {
    state
        .sync_manager
        .stop_sync(account_id)
        .await
        .map_err(|error| error.to_string())
}

async fn get_sync_status_for_state(state: &AppState) -> Result<std::collections::HashMap<String, SyncState>, String> {
    Ok(state.sync_manager.status_snapshot().await)
}

async fn mailbox_overview_for_state(state: &AppState) -> Result<MailboxOverview, String> {
    let account = list_accounts_for_state(state)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| "no account configured".to_string())?;

    let folders = list_folders_for_state(state, &account.id).await?;

    let default_folder = folders
        .iter()
        .find(|folder| folder.role == Some(FolderRole::Inbox))
        .or_else(|| folders.first())
        .ok_or_else(|| "no folder configured".to_string())?;

    let threads = list_threads_for_state(state, &account.id, &default_folder.id, 0, 25).await?;

    Ok(MailboxOverview {
        account_id: account.id,
        active_folder_id: default_folder.id.clone(),
        folders,
        threads,
        sync_state: account.sync_state,
    })
}

#[tauri::command]
pub async fn health_check() -> Result<String, String> {
    Ok("Open Mail backend running".to_string())
}

#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    list_accounts_for_state(&state).await
}

#[tauri::command]
pub async fn list_folders(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<Folder>, String> {
    list_folders_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn list_threads(
    state: State<'_, AppState>,
    account_id: String,
    folder_id: String,
    offset: u32,
    limit: u32,
) -> Result<Vec<ThreadSummary>, String> {
    list_threads_for_state(&state, &account_id, &folder_id, offset, limit).await
}

#[tauri::command]
pub async fn search_threads(
    state: State<'_, AppState>,
    account_id: String,
    query: String,
) -> Result<Vec<ThreadSummary>, String> {
    search_threads_for_state(&state, &account_id, &query).await
}

#[tauri::command]
pub async fn list_messages(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Vec<Message>, String> {
    list_messages_for_state(&state, &thread_id).await
}

#[tauri::command]
pub async fn get_message(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<Option<Message>, String> {
    get_message_for_state(&state, &message_id).await
}

#[tauri::command]
pub async fn mailbox_overview(state: State<'_, AppState>) -> Result<MailboxOverview, String> {
    mailbox_overview_for_state(&state).await
}

#[tauri::command]
pub async fn start_sync(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
    start_sync_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn stop_sync(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
    stop_sync_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn get_sync_status(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, SyncState>, String> {
    get_sync_status_for_state(&state).await
}

pub async fn seed_demo_data(state: &AppState) -> Result<(), String> {
    if !state
        .account_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())?
        .is_empty()
    {
        return Ok(());
    }

    let timestamp = chrono::DateTime::parse_from_rfc3339("2026-03-13T10:00:00Z")
        .map(|value| value.with_timezone(&chrono::Utc))
        .map_err(|error| error.to_string())?;

    let account = Account {
        id: "acc_demo".into(),
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
        sync_state: SyncState::NotStarted,
        created_at: timestamp,
        updated_at: timestamp,
    };
    state
        .account_repo
        .save(&account)
        .await
        .map_err(|error| error.to_string())?;

    let folders = vec![
        Folder {
            id: "fld_inbox".into(),
            account_id: account.id.clone(),
            name: "Inbox".into(),
            path: "INBOX".into(),
            role: Some(FolderRole::Inbox),
            unread_count: 2,
            total_count: 12,
            created_at: timestamp,
            updated_at: timestamp,
        },
        Folder {
            id: "fld_starred".into(),
            account_id: account.id.clone(),
            name: "Starred".into(),
            path: "Starred".into(),
            role: Some(FolderRole::Starred),
            unread_count: 0,
            total_count: 3,
            created_at: timestamp,
            updated_at: timestamp,
        },
        Folder {
            id: "fld_sent".into(),
            account_id: account.id.clone(),
            name: "Sent".into(),
            path: "Sent".into(),
            role: Some(FolderRole::Sent),
            unread_count: 0,
            total_count: 42,
            created_at: timestamp,
            updated_at: timestamp,
        },
        Folder {
            id: "fld_archive".into(),
            account_id: account.id.clone(),
            name: "Archive".into(),
            path: "Archive".into(),
            role: Some(FolderRole::Archive),
            unread_count: 0,
            total_count: 0,
            created_at: timestamp,
            updated_at: timestamp,
        },
    ];
    state
        .folder_repo
        .save_batch(&folders)
        .await
        .map_err(|error| error.to_string())?;

    let threads = vec![
        Thread {
            id: "thr_1".into(),
            account_id: account.id.clone(),
            subject: "Premium motion system approved".into(),
            snippet: "Vamos fechar a base visual do composer e da thread list hoje.".into(),
            message_count: 3,
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
            account_id: account.id.clone(),
            subject: "Rust health-check online".into(),
            snippet: "IPC inicial respondeu sem erro e o shell já consegue refletir o estado."
                .into(),
            message_count: 2,
            participant_ids: vec!["infra@example.com".into()],
            folder_ids: vec!["fld_inbox".into(), "fld_starred".into()],
            label_ids: vec![],
            has_attachments: false,
            is_unread: false,
            is_starred: true,
            last_message_at: timestamp - chrono::Duration::minutes(32),
            last_message_sent_at: Some(timestamp - chrono::Duration::minutes(32)),
            created_at: timestamp,
            updated_at: timestamp,
        },
        Thread {
            id: "thr_3".into(),
            account_id: account.id.clone(),
            subject: "Ship notes for desktop alpha".into(),
            snippet: "Build desktop alpha aprovado, agora seguimos com pacote de release."
                .into(),
            message_count: 1,
            participant_ids: vec!["release@example.com".into()],
            folder_ids: vec!["fld_sent".into()],
            label_ids: vec![],
            has_attachments: false,
            is_unread: false,
            is_starred: false,
            last_message_at: timestamp - chrono::Duration::hours(3),
            last_message_sent_at: Some(timestamp - chrono::Duration::hours(3)),
            created_at: timestamp,
            updated_at: timestamp,
        },
    ];
    state
        .thread_repo
        .save_batch(&threads)
        .await
        .map_err(|error| error.to_string())?;

    let messages = vec![
        Message {
            id: "msg_1".into(),
            account_id: account.id.clone(),
            thread_id: "thr_1".into(),
            from: vec![crate::domain::models::contact::Contact {
                id: "ct_atlas".into(),
                account_id: account.id.clone(),
                name: Some("Atlas Design".into()),
                email: "atlas@example.com".into(),
                is_me: false,
                created_at: timestamp,
                updated_at: timestamp,
            }],
            to: vec![],
            cc: vec![],
            bcc: vec![],
            reply_to: vec![],
            subject: "Premium motion system approved".into(),
            snippet: "Vamos fechar a base visual do composer e da thread list hoje.".into(),
            body: "<p>Vamos fechar a base visual do composer e da thread list hoje.</p>".into(),
            plain_text: Some(
                "Vamos fechar a base visual do composer e da thread list hoje.".into(),
            ),
            message_id_header: "<msg_1@openmail.dev>".into(),
            in_reply_to: None,
            references: vec![],
            folder_id: "fld_inbox".into(),
            label_ids: vec![],
            is_unread: true,
            is_starred: false,
            is_draft: false,
            date: timestamp,
            attachments: vec![crate::domain::models::attachment::Attachment {
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
            account_id: account.id.clone(),
            thread_id: "thr_2".into(),
            from: vec![crate::domain::models::contact::Contact {
                id: "ct_infra".into(),
                account_id: account.id.clone(),
                name: Some("Infra Sync".into()),
                email: "infra@example.com".into(),
                is_me: false,
                created_at: timestamp,
                updated_at: timestamp,
            }],
            to: vec![],
            cc: vec![],
            bcc: vec![],
            reply_to: vec![],
            subject: "Rust health-check online".into(),
            snippet: "IPC inicial respondeu sem erro e o shell já consegue refletir o estado."
                .into(),
            body: "<p>IPC inicial respondeu sem erro e o shell já consegue refletir o estado.</p>"
                .into(),
            plain_text: Some(
                "IPC inicial respondeu sem erro e o shell já consegue refletir o estado.".into(),
            ),
            message_id_header: "<msg_2@openmail.dev>".into(),
            in_reply_to: None,
            references: vec![],
            folder_id: "fld_starred".into(),
            label_ids: vec![],
            is_unread: false,
            is_starred: true,
            is_draft: false,
            date: timestamp - chrono::Duration::minutes(32),
            attachments: vec![],
            headers: std::collections::HashMap::new(),
            created_at: timestamp,
            updated_at: timestamp,
        },
        Message {
            id: "msg_3".into(),
            account_id: account.id.clone(),
            thread_id: "thr_3".into(),
            from: vec![crate::domain::models::contact::Contact {
                id: "ct_me".into(),
                account_id: account.id.clone(),
                name: Some("Leco".into()),
                email: "leco@example.com".into(),
                is_me: true,
                created_at: timestamp,
                updated_at: timestamp,
            }],
            to: vec![crate::domain::models::contact::Contact {
                id: "ct_release".into(),
                account_id: account.id.clone(),
                name: Some("Release Ops".into()),
                email: "release@example.com".into(),
                is_me: false,
                created_at: timestamp,
                updated_at: timestamp,
            }],
            cc: vec![],
            bcc: vec![],
            reply_to: vec![],
            subject: "Ship notes for desktop alpha".into(),
            snippet: "Build desktop alpha aprovado, agora seguimos com pacote de release.".into(),
            body: "<p>Build desktop alpha aprovado, agora seguimos com pacote de release.</p>"
                .into(),
            plain_text: Some(
                "Build desktop alpha aprovado, agora seguimos com pacote de release.".into(),
            ),
            message_id_header: "<msg_3@openmail.dev>".into(),
            in_reply_to: None,
            references: vec![],
            folder_id: "fld_sent".into(),
            label_ids: vec![],
            is_unread: false,
            is_starred: false,
            is_draft: false,
            date: timestamp - chrono::Duration::hours(3),
            attachments: vec![],
            headers: std::collections::HashMap::new(),
            created_at: timestamp,
            updated_at: timestamp,
        },
    ];
    state
        .message_repo
        .save_batch(&messages)
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        get_message_for_state, get_sync_status_for_state, list_messages_for_state,
        list_threads_for_state, mailbox_overview_for_state, search_threads_for_state,
        seed_demo_data, start_sync_for_state, stop_sync_for_state,
    };
    use crate::{
        domain::models::account::SyncState,
        domain::repositories::{
            AccountRepository, FolderRepository, MessageRepository, ThreadRepository,
        },
        infrastructure::{
            database::{
                repositories::{
                    account_repository::SqliteAccountRepository,
                    folder_repository::SqliteFolderRepository,
                    message_repository::SqliteMessageRepository,
                    thread_repository::SqliteThreadRepository,
                },
                Database,
            },
            sync::SyncManager,
        },
        AppState,
    };

    fn build_test_state() -> AppState {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let database_path =
            std::env::temp_dir().join(format!("open-mail-commands-{unique_suffix}.db"));
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
        let sync_manager = Arc::new(SyncManager::new(account_repo.clone()));

        AppState {
            db,
            account_repo,
            folder_repo,
            thread_repo,
            message_repo,
            sync_manager,
        }
    }

    #[tokio::test]
    async fn mailbox_overview_prefers_inbox_and_returns_thread_summaries() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let overview = mailbox_overview_for_state(&state).await.unwrap();

        assert_eq!(overview.account_id, "acc_demo");
        assert_eq!(overview.active_folder_id, "fld_inbox");
        assert_eq!(overview.threads.len(), 2);
        assert_eq!(overview.threads[0].id, "thr_1");
        assert!(overview.threads[0].has_attachments);
        assert_eq!(overview.threads[0].message_count, 3);
    }

    #[tokio::test]
    async fn thread_commands_trim_search_and_keep_folder_scoping() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let inbox_threads = list_threads_for_state(&state, "acc_demo", "fld_inbox", 0, 25)
            .await
            .unwrap();
        let search_results = search_threads_for_state(&state, "acc_demo", "  rust  ")
            .await
            .unwrap();
        let empty_search = search_threads_for_state(&state, "acc_demo", "   ")
            .await
            .unwrap();

        assert_eq!(inbox_threads.len(), 2);
        assert_eq!(search_results.len(), 1);
        assert_eq!(search_results[0].id, "thr_2");
        assert!(empty_search.is_empty());
    }

    #[tokio::test]
    async fn message_commands_return_thread_messages_and_selected_detail() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let thread_messages = list_messages_for_state(&state, "thr_1").await.unwrap();
        let message = get_message_for_state(&state, "msg_1").await.unwrap().unwrap();

        assert_eq!(thread_messages.len(), 1);
        assert_eq!(message.id, "msg_1");
        assert_eq!(message.attachments.len(), 1);
        assert_eq!(message.subject, "Premium motion system approved");
    }

    #[tokio::test]
    async fn sync_commands_start_and_stop_account_workers() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        start_sync_for_state(&state, "acc_demo").await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;

        let running_statuses = get_sync_status_for_state(&state).await.unwrap();
        assert_eq!(running_statuses.get("acc_demo"), Some(&SyncState::Sleeping));

        stop_sync_for_state(&state, "acc_demo").await.unwrap();
        let stopped_statuses = get_sync_status_for_state(&state).await.unwrap();
        assert_eq!(stopped_statuses.get("acc_demo"), Some(&SyncState::Sleeping));
    }
}
