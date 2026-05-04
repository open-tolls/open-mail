use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub language: String,
    pub default_account_id: Option<String>,
    pub mark_as_read_on_open: bool,
    pub show_snippets: bool,
    pub auto_load_images: bool,
    pub include_signature_in_replies: bool,
    pub request_read_receipts: bool,
    pub undo_send_delay_seconds: u32,
    pub launch_at_login: bool,
    pub check_for_updates: bool,
    pub minimize_to_tray: bool,
    pub theme: String,
    pub font_size: u32,
    pub layout_mode: String,
    pub density: String,
    pub thread_panel_width: u32,
    pub notifications_enabled: bool,
    pub notification_sound: bool,
    pub notification_scope: String,
    pub quiet_hours_start: String,
    pub quiet_hours_end: String,
    pub developer_tools_enabled: bool,
    pub log_level: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: "English".into(),
            default_account_id: None,
            mark_as_read_on_open: true,
            show_snippets: true,
            auto_load_images: false,
            include_signature_in_replies: true,
            request_read_receipts: false,
            undo_send_delay_seconds: 5,
            launch_at_login: true,
            check_for_updates: true,
            minimize_to_tray: false,
            theme: "system".into(),
            font_size: 16,
            layout_mode: "split".into(),
            density: "comfortable".into(),
            thread_panel_width: 58,
            notifications_enabled: true,
            notification_sound: true,
            notification_scope: "inbox".into(),
            quiet_hours_start: String::new(),
            quiet_hours_end: String::new(),
            developer_tools_enabled: false,
            log_level: "info".into(),
        }
    }
}
