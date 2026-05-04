use async_trait::async_trait;
use rusqlite::{params, OptionalExtension, Row};

use crate::{
    domain::{
        errors::DomainError,
        models::config::AppConfig,
        repositories::ConfigRepository,
    },
    infrastructure::database::Database,
};

#[derive(Clone)]
pub struct SqliteConfigRepository {
    db: Database,
}

impl SqliteConfigRepository {
    pub fn new(db: Database) -> Self {
        Self { db }
    }
}

#[async_trait]
impl ConfigRepository for SqliteConfigRepository {
    async fn get(&self) -> Result<AppConfig, DomainError> {
        let connection = self.db.connection()?;
        let config = connection
            .query_row(
                "SELECT
                    language,
                    default_account_id,
                    mark_as_read_on_open,
                    show_snippets,
                    auto_load_images,
                    include_signature_in_replies,
                    request_read_receipts,
                    undo_send_delay_seconds,
                    launch_at_login,
                    check_for_updates,
                    minimize_to_tray,
                    theme,
                    font_size,
                    layout_mode,
                    density,
                    thread_panel_width,
                    notifications_enabled,
                    notification_sound,
                    notification_scope,
                    quiet_hours_start,
                    quiet_hours_end,
                    developer_tools_enabled,
                    log_level
                 FROM app_config
                 WHERE id = 1",
                [],
                map_config,
            )
            .optional()
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(config.unwrap_or_default())
    }

    async fn save(&self, config: &AppConfig) -> Result<(), DomainError> {
        let connection = self.db.connection()?;
        connection
            .execute(
                "INSERT INTO app_config (
                    id,
                    language,
                    default_account_id,
                    mark_as_read_on_open,
                    show_snippets,
                    auto_load_images,
                    include_signature_in_replies,
                    request_read_receipts,
                    undo_send_delay_seconds,
                    launch_at_login,
                    check_for_updates,
                    minimize_to_tray,
                    theme,
                    font_size,
                    layout_mode,
                    density,
                    thread_panel_width,
                    notifications_enabled,
                    notification_sound,
                    notification_scope,
                    quiet_hours_start,
                    quiet_hours_end,
                    developer_tools_enabled,
                    log_level
                 ) VALUES (
                    1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
                 )
                 ON CONFLICT(id) DO UPDATE SET
                    language = excluded.language,
                    default_account_id = excluded.default_account_id,
                    mark_as_read_on_open = excluded.mark_as_read_on_open,
                    show_snippets = excluded.show_snippets,
                    auto_load_images = excluded.auto_load_images,
                    include_signature_in_replies = excluded.include_signature_in_replies,
                    request_read_receipts = excluded.request_read_receipts,
                    undo_send_delay_seconds = excluded.undo_send_delay_seconds,
                    launch_at_login = excluded.launch_at_login,
                    check_for_updates = excluded.check_for_updates,
                    minimize_to_tray = excluded.minimize_to_tray,
                    theme = excluded.theme,
                    font_size = excluded.font_size,
                    layout_mode = excluded.layout_mode,
                    density = excluded.density,
                    thread_panel_width = excluded.thread_panel_width,
                    notifications_enabled = excluded.notifications_enabled,
                    notification_sound = excluded.notification_sound,
                    notification_scope = excluded.notification_scope,
                    quiet_hours_start = excluded.quiet_hours_start,
                    quiet_hours_end = excluded.quiet_hours_end,
                    developer_tools_enabled = excluded.developer_tools_enabled,
                    log_level = excluded.log_level",
                params![
                    config.language,
                    config.default_account_id,
                    config.mark_as_read_on_open,
                    config.show_snippets,
                    config.auto_load_images,
                    config.include_signature_in_replies,
                    config.request_read_receipts,
                    config.undo_send_delay_seconds,
                    config.launch_at_login,
                    config.check_for_updates,
                    config.minimize_to_tray,
                    config.theme,
                    config.font_size,
                    config.layout_mode,
                    config.density,
                    config.thread_panel_width,
                    config.notifications_enabled,
                    config.notification_sound,
                    config.notification_scope,
                    config.quiet_hours_start,
                    config.quiet_hours_end,
                    config.developer_tools_enabled,
                    config.log_level,
                ],
            )
            .map_err(|error| DomainError::Database(error.to_string()))?;

        Ok(())
    }
}

fn map_config(row: &Row<'_>) -> rusqlite::Result<AppConfig> {
    Ok(AppConfig {
        language: row.get(0)?,
        default_account_id: row.get(1)?,
        mark_as_read_on_open: row.get(2)?,
        show_snippets: row.get(3)?,
        auto_load_images: row.get(4)?,
        include_signature_in_replies: row.get(5)?,
        request_read_receipts: row.get(6)?,
        undo_send_delay_seconds: row.get(7)?,
        launch_at_login: row.get(8)?,
        check_for_updates: row.get(9)?,
        minimize_to_tray: row.get(10)?,
        theme: row.get(11)?,
        font_size: row.get(12)?,
        layout_mode: row.get(13)?,
        density: row.get(14)?,
        thread_panel_width: row.get(15)?,
        notifications_enabled: row.get(16)?,
        notification_sound: row.get(17)?,
        notification_scope: row.get(18)?,
        quiet_hours_start: row.get(19)?,
        quiet_hours_end: row.get(20)?,
        developer_tools_enabled: row.get(21)?,
        log_level: row.get(22)?,
    })
}
