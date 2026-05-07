pub mod commands;
pub mod domain;
pub mod infrastructure;
pub mod plugins;

use std::{
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
};

use commands::{
    add_account, autodiscover_settings, build_oauth_authorization_url, complete_oauth_account,
    delete_draft, delete_signature, download_attachment, enqueue_outbox_message, flush_outbox,
    force_sync, get_config, get_message, get_sync_status, get_sync_status_detail, health_check,
    list_accounts, list_drafts, list_folders, list_messages, list_signatures, list_snoozed,
    list_threads, list_scheduled_sends,
    mailbox_overview, mark_messages_read, mark_messages_unread, open_external_url,
    remove_account, save_account_credentials, save_draft, save_signature, schedule_send, cancel_scheduled_send, search_threads, snooze_thread,
    set_default_signature, set_tray_unread_count, start_sync, stop_sync, test_imap_connection, test_smtp_connection,
    unsnooze_thread, update_config, wake_due_snoozed_threads_for_state, process_due_scheduled_sends_for_state,
};
use domain::events::{AppShellEvent, DomainEvent};
use domain::repositories::{
    AccountRepository, ConfigRepository, FolderRepository, MessageRepository, OutboxRepository,
    ScheduledSendRepository, SignatureRepository, SnoozeRepository, SyncCursorRepository, ThreadRepository,
};
use infrastructure::{
    database::{
        repositories::{
            account_repository::SqliteAccountRepository, folder_repository::SqliteFolderRepository,
            config_repository::SqliteConfigRepository,
            message_repository::SqliteMessageRepository, outbox_repository::SqliteOutboxRepository,
            scheduled_send_repository::SqliteScheduledSendRepository,
            signature_repository::SqliteSignatureRepository,
            snooze_repository::SqliteSnoozeRepository,
            sync_cursor_repository::SqliteSyncCursorRepository,
            thread_repository::SqliteThreadRepository,
        },
        Database,
    },
    sync::{
        CredentialStore, InMemoryMailTaskQueue, MailTaskQueue, SyncEventEmitter, SyncManager,
    },
};
use plugins::{PermissionChecker, PermissionPolicy, PluginHost};
#[cfg(not(target_os = "macos"))]
use infrastructure::sync::FileCredentialStore;
#[cfg(target_os = "macos")]
use infrastructure::sync::KeychainCredentialStore;
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
    pub scheduled_send_repo: Arc<dyn ScheduledSendRepository>,
    pub config_repo: Arc<dyn ConfigRepository>,
    pub snooze_repo: Arc<dyn SnoozeRepository>,
    pub minimize_to_tray: Arc<AtomicBool>,
    pub credential_store: Arc<dyn CredentialStore>,
    pub task_queue: Arc<dyn MailTaskQueue>,
    pub sync_cursor_repo: Arc<dyn SyncCursorRepository>,
    pub sync_manager: Arc<SyncManager>,
    pub plugin_host: Arc<Mutex<PluginHost>>,
}

struct TauriSyncEventEmitter {
    app_handle: tauri::AppHandle,
    message_repo: Arc<dyn MessageRepository>,
    thread_repo: Arc<dyn ThreadRepository>,
    plugin_host: Arc<Mutex<PluginHost>>,
}

impl SyncEventEmitter for TauriSyncEventEmitter {
    fn emit(&self, event: &DomainEvent) {
        let plugin_host = self.plugin_host.clone();
        let message_repo = self.message_repo.clone();
        let thread_repo = self.thread_repo.clone();

        match event.clone() {
            DomainEvent::MessagesChanged { message_ids, .. } => {
                tauri::async_runtime::spawn(async move {
                    for message_id in message_ids {
                        let Ok(Some(message)) = message_repo.find_by_id(&message_id).await else {
                            continue;
                        };
                        let Ok(payload) = serde_json::to_value(&message) else {
                            continue;
                        };
                        if let Ok(mut plugin_host) = plugin_host.lock() {
                            let _ = plugin_host.dispatch_hook("on_message_received", &payload);
                        }
                    }
                });
            }
            DomainEvent::ThreadsChanged { thread_ids, .. } => {
                tauri::async_runtime::spawn(async move {
                    for thread_id in thread_ids {
                        let Ok(Some(thread)) = thread_repo.find_by_id(&thread_id).await else {
                            continue;
                        };
                        let Ok(payload) = serde_json::to_value(&thread) else {
                            continue;
                        };
                        if let Ok(mut plugin_host) = plugin_host.lock() {
                            let _ = plugin_host.dispatch_hook("on_thread_changed", &payload);
                        }
                    }
                });
            }
            _ => {}
        }

        if let DomainEvent::SyncStatusChanged { account_id, state } = event {
            if matches!(state, crate::domain::models::account::SyncState::Sleeping) {
                if let Ok(mut plugin_host) = self.plugin_host.lock() {
                    let payload = serde_json::json!({
                        "accountId": account_id,
                        "state": state,
                    });
                    let _ = plugin_host.dispatch_hook("on_sync_completed", &payload);
                }
            }
        }

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

fn spawn_snooze_wakeup_loop<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));

        loop {
            ticker.tick().await;

            let awakened_threads = {
                let state = app.state::<AppState>();
                wake_due_snoozed_threads_for_state(state.inner())
                    .await
                    .unwrap_or_default()
            };

            if awakened_threads.is_empty() {
                continue;
            }

            let mut thread_ids_by_account: std::collections::BTreeMap<String, Vec<String>> =
                std::collections::BTreeMap::new();

            for (account_id, thread_id) in awakened_threads {
                thread_ids_by_account
                    .entry(account_id)
                    .or_default()
                    .push(thread_id);
            }

            for (account_id, thread_ids) in thread_ids_by_account {
                for thread_id in &thread_ids {
                    let _ = app.emit(
                        "domain:event",
                        DomainEvent::SnoozeWoke {
                            account_id: account_id.clone(),
                            thread_id: thread_id.clone(),
                        },
                    );
                }
                let _ = app.emit(
                    "domain:event",
                    DomainEvent::ThreadsChanged {
                        account_id: account_id.clone(),
                        thread_ids,
                    },
                );
                let _ = app.emit(
                    "domain:event",
                    DomainEvent::FoldersChanged { account_id },
                );
            }
        }
    });
}

fn spawn_scheduled_send_loop<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(30));

        loop {
            ticker.tick().await;

            let processed_sends = {
                let state = app.state::<AppState>();
                process_due_scheduled_sends_for_state(state.inner())
                    .await
                    .unwrap_or_default()
            };

            for processed_send in processed_sends {
                let _ = app.emit(
                    "domain:event",
                    DomainEvent::ScheduledSendProcessed {
                        account_id: processed_send.account_id.clone(),
                        scheduled_send_id: processed_send.id,
                        subject: processed_send.mime_message.subject,
                        success: processed_send.status
                            == crate::domain::models::scheduled_send::ScheduledSendStatus::Sent,
                        error_message: processed_send.last_error,
                    },
                );
            }
        }
    });
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
        .plugin(tauri_plugin_deep_link::init())
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
                message_repo: app.state::<AppState>().message_repo.clone(),
                thread_repo: app.state::<AppState>().thread_repo.clone(),
                plugin_host: app.state::<AppState>().plugin_host.clone(),
            }));
            app.emit("domain:event", DomainEvent::ApplicationStarted)
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            let sync_manager = sync_manager.clone();
            tauri::async_runtime::spawn(async move {
                let _ = sync_manager.bootstrap_accounts().await;
            });
            spawn_snooze_wakeup_loop(app.handle().clone());
            spawn_scheduled_send_loop(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.minimize_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            list_scheduled_sends,
            list_snoozed,
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
            schedule_send,
            cancel_scheduled_send,
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
            snooze_thread,
            unsnooze_thread,
            download_attachment,
            open_external_url,
            set_tray_unread_count,
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
    let scheduled_send_repo: Arc<dyn ScheduledSendRepository> =
        Arc::new(SqliteScheduledSendRepository::new(db.clone()));
    let config_repo: Arc<dyn ConfigRepository> = Arc::new(SqliteConfigRepository::new(db.clone()));
    let snooze_repo: Arc<dyn SnoozeRepository> = Arc::new(SqliteSnoozeRepository::new(db.clone()));
    let minimize_to_tray = Arc::new(AtomicBool::new(
        tauri::async_runtime::block_on(config_repo.get())
            .map(|config| config.minimize_to_tray)
            .unwrap_or(false),
    ));
    let credential_store = build_desktop_credential_store()?;
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
    let plugin_host = Arc::new(Mutex::new(PluginHost::new(PermissionChecker::new(
        PermissionPolicy::allow_all(),
    ))));

    Ok(AppState {
        db,
        account_repo,
        folder_repo,
        thread_repo,
        message_repo,
        outbox_repo,
        signature_repo,
        scheduled_send_repo,
        config_repo,
        snooze_repo,
        minimize_to_tray,
        credential_store,
        task_queue,
        sync_cursor_repo,
        sync_manager,
        plugin_host,
    })
}

fn default_database_path() -> PathBuf {
    std::env::temp_dir().join("open-mail-dev.sqlite")
}

#[cfg(not(target_os = "macos"))]
fn default_credential_store_path() -> PathBuf {
    std::env::temp_dir().join("open-mail-dev-credentials.json")
}

fn build_desktop_credential_store() -> Result<Arc<dyn CredentialStore>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(Arc::new(KeychainCredentialStore::new("Open Mail")))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let credential_store_path = default_credential_store_path();
        Ok(Arc::new(
            FileCredentialStore::new(&credential_store_path).map_err(|error| error.to_string())?,
        ))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke_test() {
        assert!(true);
    }
}
