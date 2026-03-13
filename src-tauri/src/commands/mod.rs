use serde::Serialize;
use tauri::State;

use crate::{
    domain::models::{
        account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
        folder::{Folder, FolderRole},
        message::Message,
        thread::Thread,
    },
    AppState,
};

#[derive(Debug, Clone, Serialize)]
pub struct MailboxOverview {
    pub account_id: String,
    pub folders: Vec<Folder>,
    pub threads: Vec<Thread>,
    pub sync_state: SyncState,
}

#[tauri::command]
pub async fn health_check() -> Result<String, String> {
    Ok("Open Mail backend running".to_string())
}

#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    state
        .account_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_folders(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<Folder>, String> {
    state
        .folder_repo
        .find_by_account(&account_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_threads(
    state: State<'_, AppState>,
    account_id: String,
    folder_id: String,
    offset: u32,
    limit: u32,
) -> Result<Vec<Thread>, String> {
    state
        .thread_repo
        .find_by_folder(&account_id, &folder_id, offset, limit)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn list_messages(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Vec<Message>, String> {
    state
        .message_repo
        .find_by_thread(&thread_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_message(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<Option<Message>, String> {
    state
        .message_repo
        .find_by_id(&message_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn mailbox_overview(state: State<'_, AppState>) -> Result<MailboxOverview, String> {
    let account = state
        .account_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "no account configured".to_string())?;

    let folders = state
        .folder_repo
        .find_by_account(&account.id)
        .await
        .map_err(|error| error.to_string())?;

    let default_folder = folders
        .iter()
        .find(|folder| folder.role == Some(FolderRole::Inbox))
        .or_else(|| folders.first())
        .ok_or_else(|| "no folder configured".to_string())?;

    let threads = state
        .thread_repo
        .find_by_folder(&account.id, &default_folder.id, 0, 25)
        .await
        .map_err(|error| error.to_string())?;

    Ok(MailboxOverview {
        account_id: account.id,
        folders,
        threads,
        sync_state: account.sync_state,
    })
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
        sync_state: SyncState::Running,
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
            folder_ids: vec!["fld_inbox".into()],
            label_ids: vec![],
            has_attachments: false,
            is_unread: false,
            is_starred: true,
            last_message_at: timestamp - chrono::Duration::minutes(32),
            last_message_sent_at: Some(timestamp - chrono::Duration::minutes(32)),
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
            folder_id: "fld_inbox".into(),
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
    ];
    state
        .message_repo
        .save_batch(&messages)
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}
