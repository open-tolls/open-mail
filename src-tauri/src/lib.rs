pub mod commands;
pub mod domain;
pub mod infrastructure;
pub mod plugins;

use std::{path::PathBuf, sync::Arc};

use commands::{
    add_account, autodiscover_settings, build_oauth_authorization_url, complete_oauth_account,
    delete_draft, delete_signature, download_attachment, enqueue_outbox_message, flush_outbox,
    force_sync, get_config, get_message, get_sync_status, get_sync_status_detail, health_check,
    list_accounts, list_drafts, list_folders, list_messages, list_signatures, list_threads,
    mailbox_overview, mark_messages_read, mark_messages_unread, open_external_url,
    remove_account, save_account_credentials, save_draft, save_signature, search_threads,
    set_default_signature, start_sync, stop_sync, test_imap_connection, test_smtp_connection,
    update_config,
};
use domain::events::{AppShellEvent, DomainEvent};
use domain::repositories::{
    AccountRepository, ConfigRepository, FolderRepository, MessageRepository, OutboxRepository,
    SignatureRepository, SyncCursorRepository, ThreadRepository,
};
use infrastructure::{
    database::{
        repositories::{
            account_repository::SqliteAccountRepository, folder_repository::SqliteFolderRepository,
            config_repository::SqliteConfigRepository,
            message_repository::SqliteMessageRepository, outbox_repository::SqliteOutboxRepository,
            signature_repository::SqliteSignatureRepository,
            sync_cursor_repository::SqliteSyncCursorRepository,
            thread_repository::SqliteThreadRepository,
        },
        Database,
    },
    sync::{
        CredentialStore, FileCredentialStore, InMemoryMailTaskQueue, MailTaskQueue,
        SyncEventEmitter, SyncManager,
    },
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;

pub struct AppState {
    pub db: Database,
    pub account_repo: Arc<dyn AccountRepository>,
    pub folder_repo: Arc<dyn FolderRepository>,
    pub thread_repo: Arc<dyn ThreadRepository>,
    pub message_repo: Arc<dyn MessageRepository>,
    pub outbox_repo: Arc<dyn OutboxRepository>,
    pub signature_repo: Arc<dyn SignatureRepository>,
    pub config_repo: Arc<dyn ConfigRepository>,
    pub credential_store: Arc<dyn CredentialStore>,
    pub task_queue: Arc<dyn MailTaskQueue>,
    pub sync_cursor_repo: Arc<dyn SyncCursorRepository>,
    pub sync_manager: Arc<SyncManager>,
}

struct TauriSyncEventEmitter {
    app_handle: tauri::AppHandle,
}

impl SyncEventEmitter for TauriSyncEventEmitter {
    fn emit(&self, event: &DomainEvent) {
        let _ = self.app_handle.emit("domain:event", event);
    }
}

fn focus_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn emit_compose_new_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let _ = app.emit("app:event", AppShellEvent::ComposeNew);
}

#[cfg(desktop)]
fn setup_system_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let open_item =
        MenuItem::with_id(app, "tray-open", "Open Open Mail", true, None::<&str>)
            .map_err(|error| error.to_string())?;
    let compose_item = MenuItem::with_id(
        app,
        "tray-compose",
        "New Message",
        true,
        Some("CmdOrCtrl+N"),
    )
    .map_err(|error| error.to_string())?;
    let quit_item =
        MenuItem::with_id(app, "tray-quit", "Quit", true, Some("CmdOrCtrl+Q"))
            .map_err(|error| error.to_string())?;
    let separator = PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?;
    let menu = Menu::with_items(app, &[&open_item, &compose_item, &separator, &quit_item])
        .map_err(|error| error.to_string())?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "default tray icon unavailable".to_string())?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .menu(&menu)
        .tooltip("Open Mail")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => focus_main_window(app),
            "tray-compose" => {
                focus_main_window(app);
                emit_compose_new_event(app);
            }
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = build_app_state().expect("failed to initialize application state");
    tauri::async_runtime::block_on(commands::seed_demo_data(&state))
        .expect("failed to seed demo data");
    let sync_manager = state.sync_manager.clone();

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            #[cfg(target_os = "macos")]
            MacosLauncher::LaunchAgent,
            #[cfg(not(target_os = "macos"))]
            MacosLauncher::LaunchAgent,
            None::<Vec<&'static str>>,
        ))
        .setup(move |app| {
            #[cfg(desktop)]
            setup_system_tray(&app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            sync_manager.set_event_emitter(Arc::new(TauriSyncEventEmitter {
                app_handle: app.handle().clone(),
            }));
            app.emit("domain:event", DomainEvent::ApplicationStarted)
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            let sync_manager = sync_manager.clone();
            tauri::async_runtime::spawn(async move {
                let _ = sync_manager.bootstrap_accounts().await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            health_check,
            list_accounts,
            autodiscover_settings,
            add_account,
            remove_account,
            complete_oauth_account,
            list_folders,
            list_drafts,
            list_threads,
            search_threads,
            list_messages,
            get_message,
            mailbox_overview,
            start_sync,
            stop_sync,
            force_sync,
            get_sync_status,
            get_sync_status_detail,
            enqueue_outbox_message,
            flush_outbox,
            save_account_credentials,
            save_draft,
            delete_draft,
            list_signatures,
            get_config,
            save_signature,
            delete_signature,
            set_default_signature,
            update_config,
            build_oauth_authorization_url,
            test_imap_connection,
            test_smtp_connection,
            download_attachment,
            open_external_url,
            mark_messages_read,
            mark_messages_unread
        ])
        .run(tauri::generate_context!())
        .expect("error while running Open Mail");
}

fn build_app_state() -> Result<AppState, String> {
    let database_path = default_database_path();
    let db = Database::new(&database_path).map_err(|error| error.to_string())?;
    db.run_migrations().map_err(|error| error.to_string())?;

    let account_repo: Arc<dyn AccountRepository> =
        Arc::new(SqliteAccountRepository::new(db.clone()));
    let folder_repo: Arc<dyn FolderRepository> = Arc::new(SqliteFolderRepository::new(db.clone()));
    let thread_repo: Arc<dyn ThreadRepository> = Arc::new(SqliteThreadRepository::new(db.clone()));
    let message_repo: Arc<dyn MessageRepository> =
        Arc::new(SqliteMessageRepository::new(db.clone()));
    let outbox_repo: Arc<dyn OutboxRepository> = Arc::new(SqliteOutboxRepository::new(db.clone()));
    let signature_repo: Arc<dyn SignatureRepository> =
        Arc::new(SqliteSignatureRepository::new(db.clone()));
    let config_repo: Arc<dyn ConfigRepository> = Arc::new(SqliteConfigRepository::new(db.clone()));
    let credential_store_path = default_credential_store_path();
    let credential_store: Arc<dyn CredentialStore> =
        Arc::new(FileCredentialStore::new(&credential_store_path).map_err(|error| error.to_string())?);
    let task_queue: Arc<dyn MailTaskQueue> = Arc::new(InMemoryMailTaskQueue::default());
    let sync_cursor_repo: Arc<dyn SyncCursorRepository> =
        Arc::new(SqliteSyncCursorRepository::new(db.clone()));
    let sync_manager = Arc::new(SyncManager::new(
        account_repo.clone(),
        folder_repo.clone(),
        thread_repo.clone(),
        message_repo.clone(),
        sync_cursor_repo.clone(),
    ));

    Ok(AppState {
        db,
        account_repo,
        folder_repo,
        thread_repo,
        message_repo,
        outbox_repo,
        signature_repo,
        config_repo,
        credential_store,
        task_queue,
        sync_cursor_repo,
        sync_manager,
    })
}

fn default_database_path() -> PathBuf {
    std::env::temp_dir().join("open-mail-dev.sqlite")
}

fn default_credential_store_path() -> PathBuf {
    std::env::temp_dir().join("open-mail-dev-credentials.json")
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke_test() {
        assert!(true);
    }
}
