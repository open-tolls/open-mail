pub mod commands;
pub mod domain;
pub mod infrastructure;
pub mod plugins;

use std::{path::PathBuf, sync::Arc};

use commands::{health_check, list_accounts, list_folders, list_threads, mailbox_overview};
use domain::repositories::{AccountRepository, FolderRepository, ThreadRepository};
use infrastructure::database::{
    repositories::{
        account_repository::SqliteAccountRepository, folder_repository::SqliteFolderRepository,
        thread_repository::SqliteThreadRepository,
    },
    Database,
};

pub struct AppState {
    pub db: Database,
    pub account_repo: Arc<dyn AccountRepository>,
    pub folder_repo: Arc<dyn FolderRepository>,
    pub thread_repo: Arc<dyn ThreadRepository>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = build_app_state().expect("failed to initialize application state");
    tauri::async_runtime::block_on(commands::seed_demo_data(&state))
        .expect("failed to seed demo data");

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            health_check,
            list_accounts,
            list_folders,
            list_threads,
            mailbox_overview
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

    Ok(AppState {
        db,
        account_repo,
        folder_repo,
        thread_repo,
    })
}

fn default_database_path() -> PathBuf {
    std::env::temp_dir().join("open-mail-dev.sqlite")
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke_test() {
        assert!(true);
    }
}
