use std::{collections::HashMap, fs, path::Path};

use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::{
    domain::models::{
        account::{Account, AccountProvider, ConnectionSettings, SecurityType, SyncState},
        config::AppConfig,
        contact::Contact,
        folder::{Folder, FolderRole},
        message::Message,
        outbox::{OutboxMessage, OutboxStatus},
        scheduled_send::{ScheduledSend, ScheduledSendStatus},
        signature::Signature,
        snooze::SnoozedThread,
        thread::Thread,
    },
    domain::read_models::{MailboxOverview, ThreadSummary},
    domain::tasks::MailTask,
    infrastructure::sync::{
        drain_outbox_for_account, FakeImapClientFactory, FakeSmtpClient, ImapClientFactory,
        LettreSmtpClient, MailAddress, MimeAttachment, MimeMessage, OAuthAuthorizationRequest,
        OAuthManager, OutboxSendReport, SmtpClient, SyncError, SyncStatusSnapshot,
    },
    AppState,
};

const SNOOZED_FOLDER_ID: &str = "fld_snoozed";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueOutboxMessageRequest {
    pub account_id: String,
    pub from: MailAddress,
    pub to: Vec<MailAddress>,
    pub cc: Vec<MailAddress>,
    pub bcc: Vec<MailAddress>,
    pub reply_to: Option<MailAddress>,
    pub subject: String,
    pub html_body: String,
    pub plain_body: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub attachments: Vec<MimeAttachment>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSendRequest {
    pub account_id: String,
    pub from: MailAddress,
    pub to: Vec<MailAddress>,
    pub cc: Vec<MailAddress>,
    pub bcc: Vec<MailAddress>,
    pub reply_to: Option<MailAddress>,
    pub subject: String,
    pub html_body: String,
    pub plain_body: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub attachments: Vec<MimeAttachment>,
    pub send_at: String,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct ParsedThreadSearch {
    after: Option<String>,
    before: Option<String>,
    from: Vec<String>,
    has_attachment: Option<bool>,
    in_folder: Option<String>,
    is_starred: Option<bool>,
    is_unread: Option<bool>,
    subject: Vec<String>,
    terms: Vec<String>,
    to: Vec<String>,
}

fn normalize_search_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn contains_case_insensitive(value: &str, needle: &str) -> bool {
    normalize_search_value(value).contains(&normalize_search_value(needle))
}

fn matches_all(values: &[String], needles: &[String]) -> bool {
    needles.iter().all(|needle| {
        values
            .iter()
            .any(|value| contains_case_insensitive(value, needle))
    })
}

fn parse_thread_search_query(query: &str) -> ParsedThreadSearch {
    let mut parsed = ParsedThreadSearch::default();

    for token in query.split_whitespace() {
        let Some((key, value)) = token.split_once(':') else {
            parsed.terms.push(token.to_string());
            continue;
        };
        let key = normalize_search_value(key);
        let value = value.trim();

        if value.is_empty() && key != "has" {
            continue;
        }

        match (key.as_str(), normalize_search_value(value).as_str()) {
            ("from", _) => parsed.from.push(value.to_string()),
            ("to", _) => parsed.to.push(value.to_string()),
            ("subject", _) => parsed.subject.push(value.to_string()),
            ("has", "attachment") => parsed.has_attachment = Some(true),
            ("is", "unread") => parsed.is_unread = Some(true),
            ("is", "starred") => parsed.is_starred = Some(true),
            ("after", _) => parsed.after = Some(value.to_string()),
            ("before", _) => parsed.before = Some(value.to_string()),
            ("in", _) => parsed.in_folder = Some(value.to_string()),
            _ => parsed.terms.push(token.to_string()),
        }
    }

    parsed
}

fn escape_fts_term(term: &str) -> String {
    format!("\"{}\"", term.replace('"', "\"\"").trim())
}

fn thread_search_seed(parsed: &ParsedThreadSearch) -> String {
    parsed
        .terms
        .iter()
        .chain(parsed.subject.iter())
        .map(|term| term.trim())
        .filter(|term| !term.is_empty())
        .map(escape_fts_term)
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_outbox_message(account_id: String, mime_message: MimeMessage) -> OutboxMessage {
    let now = chrono::Utc::now();

    OutboxMessage {
        id: format!("out_{}", Uuid::new_v4()),
        account_id,
        mime_message,
        status: OutboxStatus::Queued,
        retry_count: 0,
        last_error: None,
        queued_at: now,
        updated_at: now,
    }
}

fn parse_thread_search_date(
    value: &str,
    end_of_day: bool,
) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&chrono::Utc))
        .ok()
        .or_else(|| {
            let date = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()?;
            let time = if end_of_day {
                chrono::NaiveTime::from_hms_opt(23, 59, 59)
            } else {
                chrono::NaiveTime::from_hms_opt(0, 0, 0)
            }?;

            Some(chrono::NaiveDateTime::new(date, time).and_utc())
        })
}

fn matches_thread_search(thread: &Thread, parsed: &ParsedThreadSearch) -> bool {
    if !matches_all(&thread.participant_ids, &parsed.from) {
        return false;
    }

    if !matches_all(&thread.participant_ids, &parsed.to) {
        return false;
    }

    if !matches_all(std::slice::from_ref(&thread.subject), &parsed.subject) {
        return false;
    }

    if parsed
        .has_attachment
        .is_some_and(|has_attachment| thread.has_attachments != has_attachment)
    {
        return false;
    }

    if parsed
        .is_unread
        .is_some_and(|is_unread| thread.is_unread != is_unread)
    {
        return false;
    }

    if parsed
        .is_starred
        .is_some_and(|is_starred| thread.is_starred != is_starred)
    {
        return false;
    }

    if parsed.after.as_ref().is_some_and(|after| {
        parse_thread_search_date(after, false)
            .map(|date| thread.last_message_at < date)
            .unwrap_or(false)
    }) {
        return false;
    }

    if parsed.before.as_ref().is_some_and(|before| {
        parse_thread_search_date(before, true)
            .map(|date| thread.last_message_at > date)
            .unwrap_or(false)
    }) {
        return false;
    }

    if parsed.in_folder.as_ref().is_some_and(|folder| {
        !thread
            .folder_ids
            .iter()
            .any(|folder_id| contains_case_insensitive(folder_id, folder))
    }) {
        return false;
    }

    true
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildOAuthAuthorizationUrlRequest {
    pub provider: AccountProvider,
    pub client_id: String,
    pub redirect_uri: String,
    pub state: Option<String>,
    pub code_challenge: String,
}

fn autodiscover_settings_for_email(email: &str) -> Option<ConnectionSettings> {
    let domain = email.trim().split('@').nth(1)?.trim().to_ascii_lowercase();

    match domain.as_str() {
        "gmail.com" | "googlemail.com" => Some(ConnectionSettings {
            imap_host: "imap.gmail.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.gmail.com".into(),
            smtp_port: 465,
            smtp_security: SecurityType::Ssl,
        }),
        "outlook.com" | "hotmail.com" | "live.com" | "office365.com" => Some(ConnectionSettings {
            imap_host: "outlook.office365.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.office365.com".into(),
            smtp_port: 587,
            smtp_security: SecurityType::StartTls,
        }),
        "yahoo.com" | "ymail.com" => Some(ConnectionSettings {
            imap_host: "imap.mail.yahoo.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.mail.yahoo.com".into(),
            smtp_port: 465,
            smtp_security: SecurityType::Ssl,
        }),
        "icloud.com" | "me.com" | "mac.com" => Some(ConnectionSettings {
            imap_host: "imap.mail.me.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.mail.me.com".into(),
            smtp_port: 587,
            smtp_security: SecurityType::StartTls,
        }),
        "fastmail.com" | "fastmail.fm" => Some(ConnectionSettings {
            imap_host: "imap.fastmail.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.fastmail.com".into(),
            smtp_port: 465,
            smtp_security: SecurityType::Ssl,
        }),
        _ => None,
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureSettings {
    pub signatures: Vec<Signature>,
    pub default_signature_id: Option<String>,
    pub default_signature_ids_by_account_id: HashMap<String, Option<String>>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSignatureRequest {
    pub id: String,
    pub title: String,
    pub body: String,
    pub account_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultSignatureRequest {
    pub signature_id: Option<String>,
    pub account_id: Option<String>,
}

async fn get_config_for_state(state: &AppState) -> Result<AppConfig, String> {
    state
        .config_repo
        .get()
        .await
        .map_err(|error| error.to_string())
}

async fn update_config_for_state(state: &AppState, config: AppConfig) -> Result<(), String> {
    state
        .config_repo
        .save(&config)
        .await
        .map_err(|error| error.to_string())?;
    state
        .minimize_to_tray
        .store(config.minimize_to_tray, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAccountCredentialsRequest {
    pub account_id: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDraftRequest {
    pub id: String,
    pub account_id: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub bcc: Vec<String>,
    pub subject: String,
    pub body: String,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionCredentialsRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestMailConnectionRequest {
    pub settings: ConnectionSettings,
    pub credentials: ConnectionCredentialsRequest,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddAccountRequest {
    pub name: String,
    pub email: String,
    pub provider: AccountProvider,
    pub settings: ConnectionSettings,
    pub credentials: ConnectionCredentialsRequest,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOAuthAccountRequest {
    pub provider: AccountProvider,
    pub client_id: String,
    pub redirect_uri: String,
    pub authorization_code: String,
    pub code_verifier: String,
    pub email: String,
    pub name: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnoozeThreadRequest {
    pub thread_id: String,
    pub until: String,
}

async fn list_accounts_for_state(state: &AppState) -> Result<Vec<Account>, String> {
    state
        .account_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())
}

async fn remove_account_for_state(state: &AppState, account_id: &str) -> Result<(), String> {
    let account = state
        .account_repo
        .find_by_id(account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("account {account_id} not found"))?;

    if !matches!(account.sync_state, SyncState::NotStarted) {
        state
            .sync_manager
            .stop_sync(account_id)
            .await
            .map_err(|error| error.to_string())?;
    }

    state
        .account_repo
        .delete(account_id)
        .await
        .map_err(|error| error.to_string())?;
    state
        .credential_store
        .delete(account_id)
        .map_err(|error| error.to_string())?;

    let mut config = state
        .config_repo
        .get()
        .await
        .map_err(|error| error.to_string())?;
    if config.default_account_id.as_deref() == Some(account_id) {
        config.default_account_id = None;
        state
            .config_repo
            .save(&config)
            .await
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn password_credentials(request: &ConnectionCredentialsRequest) -> crate::infrastructure::sync::Credentials {
    crate::infrastructure::sync::Credentials::Password {
        username: request.username.trim().to_string(),
        password: request.password.clone(),
    }
}

async fn persist_account_with_credentials(
    state: &AppState,
    name: String,
    email: String,
    provider: AccountProvider,
    settings: ConnectionSettings,
    credentials: crate::infrastructure::sync::Credentials,
) -> Result<Account, String> {
    let account_id = format!("acc_{}", Uuid::new_v4().simple());
    let now = chrono::Utc::now();
    let account = Account {
        id: account_id,
        name: name.trim().to_string(),
        email_address: email.trim().to_string(),
        provider,
        connection_settings: settings,
        sync_state: SyncState::NotStarted,
        created_at: now,
        updated_at: now,
    };

    state
        .account_repo
        .save(&account)
        .await
        .map_err(|error| error.to_string())?;
    state
        .credential_store
        .save(&account.id, credentials)
        .map_err(|error| error.to_string())?;
    state
        .folder_repo
        .save_batch(&create_account_folders(&account.id, now))
        .await
        .map_err(|error| error.to_string())?;

    Ok(account)
}

fn create_account_folders(account_id: &str, timestamp: chrono::DateTime<chrono::Utc>) -> Vec<Folder> {
    let folder_specs = [
        ("Inbox", "INBOX", Some(FolderRole::Inbox)),
        ("Starred", "Starred", Some(FolderRole::Starred)),
        ("Important", "Important", Some(FolderRole::Important)),
        ("Drafts", "Drafts", Some(FolderRole::Drafts)),
        ("Sent", "Sent", Some(FolderRole::Sent)),
        ("Archive", "Archive", Some(FolderRole::Archive)),
        ("Spam", "Spam", Some(FolderRole::Spam)),
        ("Trash", "Trash", Some(FolderRole::Trash)),
    ];

    folder_specs
        .into_iter()
        .map(|(name, path, role)| Folder {
            id: format!(
                "fld_{}_{}",
                account_id,
                role.as_ref()
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| name.to_lowercase())
            ),
            account_id: account_id.into(),
            name: name.into(),
            path: path.into(),
            role,
            unread_count: 0,
            total_count: 0,
            created_at: timestamp,
            updated_at: timestamp,
        })
        .collect()
}

async fn test_imap_connection_for_state(
    _state: &AppState,
    request: TestMailConnectionRequest,
) -> Result<(), String> {
    let account = Account {
        id: "acc_test_connection".into(),
        name: "Connection Test".into(),
        email_address: request.credentials.username.trim().to_string(),
        provider: AccountProvider::Imap,
        connection_settings: request.settings,
        sync_state: SyncState::NotStarted,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };
    let mut client = FakeImapClientFactory
        .create(&account)
        .await
        .map_err(|error| error.to_string())?;

    client
        .connect(
            &account.connection_settings,
            &password_credentials(&request.credentials),
        )
        .await
        .map_err(|error| error.to_string())
}

async fn test_smtp_connection_for_state(
    _state: &AppState,
    request: TestMailConnectionRequest,
) -> Result<(), String> {
    let credentials = password_credentials(&request.credentials);

    if request.settings.smtp_host.ends_with("example.com") {
        let mut smtp_client = FakeSmtpClient::default();
        return smtp_client
            .test_connection(&request.settings, &credentials)
            .await
            .map_err(|error| error.to_string());
    }

    let mut smtp_client = LettreSmtpClient;
    smtp_client
        .test_connection(&request.settings, &credentials)
        .await
        .map_err(|error| error.to_string())
}

async fn add_account_for_state(state: &AppState, request: AddAccountRequest) -> Result<Account, String> {
    persist_account_with_credentials(
        state,
        request.name,
        request.email,
        request.provider,
        request.settings,
        password_credentials(&request.credentials),
    )
    .await
}

fn default_signature(now: chrono::DateTime<chrono::Utc>) -> Signature {
    Signature {
        id: "sig_default".into(),
        title: "Default signature".into(),
        body: "<p>Best,<br />Leco</p>".into(),
        account_id: None,
        created_at: now,
        updated_at: now,
    }
}

async fn list_signatures_for_state(state: &AppState) -> Result<SignatureSettings, String> {
    let mut signatures = state
        .signature_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())?;

    if signatures.is_empty() {
        let signature = default_signature(chrono::Utc::now());
        state
            .signature_repo
            .save(&signature)
            .await
            .map_err(|error| error.to_string())?;
        state
            .signature_repo
            .set_default(Some(&signature.id), None)
            .await
            .map_err(|error| error.to_string())?;
        signatures.push(signature);
    }

    let default_signature_id = state
        .signature_repo
        .find_default_global()
        .await
        .map_err(|error| error.to_string())?;
    let default_signature_ids_by_account_id = state
        .signature_repo
        .find_defaults_by_account()
        .await
        .map_err(|error| error.to_string())?;

    Ok(SignatureSettings {
        signatures,
        default_signature_id,
        default_signature_ids_by_account_id,
    })
}

async fn save_signature_for_state(
    state: &AppState,
    request: SaveSignatureRequest,
) -> Result<Signature, String> {
    let existing_signature = state
        .signature_repo
        .find_all()
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|signature| signature.id == request.id);
    let now = chrono::Utc::now();
    let signature = Signature {
        id: request.id,
        title: request.title,
        body: request.body,
        account_id: request.account_id,
        created_at: existing_signature
            .as_ref()
            .map(|signature| signature.created_at)
            .unwrap_or(now),
        updated_at: now,
    };

    state
        .signature_repo
        .save(&signature)
        .await
        .map_err(|error| error.to_string())?;

    Ok(signature)
}

async fn delete_signature_for_state(state: &AppState, id: &str) -> Result<(), String> {
    state
        .signature_repo
        .delete(id)
        .await
        .map_err(|error| error.to_string())
}

async fn set_default_signature_for_state(
    state: &AppState,
    request: SetDefaultSignatureRequest,
) -> Result<(), String> {
    state
        .signature_repo
        .set_default(request.signature_id.as_deref(), request.account_id.as_deref())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    get_config_for_state(&state).await
}

#[tauri::command]
pub async fn update_config(
    state: State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    update_config_for_state(&state, config).await
}

fn download_attachment_file(
    source_path: impl AsRef<Path>,
    save_path: impl AsRef<Path>,
) -> Result<(), String> {
    let source_path = source_path.as_ref();
    let save_path = save_path.as_ref();

    if !source_path.is_file() {
        return Err("Attachment file is unavailable".into());
    }

    if let Some(parent) = save_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::copy(source_path, save_path)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

async fn list_folders_for_state(state: &AppState, account_id: &str) -> Result<Vec<Folder>, String> {
    let mut folders = state
        .folder_repo
        .find_by_account(account_id)
        .await
        .map_err(|error| error.to_string())?;
    let active_snoozes = state
        .snooze_repo
        .find_active_by_account(account_id, chrono::Utc::now())
        .await
        .map_err(|error| error.to_string())?;
    let mut snoozed_unread_count = 0;

    if !active_snoozes.is_empty() {
        for snooze in &active_snoozes {
            if let Some(thread) = state
                .thread_repo
                .find_by_id(&snooze.thread_id)
                .await
                .map_err(|error| error.to_string())?
            {
                if thread.is_unread {
                    snoozed_unread_count += 1;
                }
                for folder in &mut folders {
                    if thread.folder_ids.contains(&folder.id) {
                        folder.total_count = folder.total_count.saturating_sub(1);
                        if thread.is_unread {
                            folder.unread_count = folder.unread_count.saturating_sub(1);
                        }
                    }
                }
            }
        }
    }
    let timestamp = chrono::Utc::now();
    folders.push(Folder {
        id: SNOOZED_FOLDER_ID.into(),
        account_id: account_id.into(),
        name: "Snoozed".into(),
        path: "Snoozed".into(),
        role: None,
        unread_count: snoozed_unread_count,
        total_count: active_snoozes.len() as u32,
        created_at: timestamp,
        updated_at: timestamp,
    });

    Ok(folders)
}

async fn list_threads_for_state(
    state: &AppState,
    account_id: &str,
    folder_id: &str,
    offset: u32,
    limit: u32,
) -> Result<Vec<ThreadSummary>, String> {
    if folder_id == SNOOZED_FOLDER_ID {
        return list_snoozed_for_state(state, account_id).await;
    }

    let snoozed_thread_ids = state
        .snooze_repo
        .find_active_by_account(account_id, chrono::Utc::now())
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|snooze| snooze.thread_id)
        .collect::<Vec<_>>();

    state
        .thread_repo
        .find_by_folder(account_id, folder_id, offset, limit.saturating_add(snoozed_thread_ids.len() as u32))
        .await
        .map(|threads| {
            threads
                .into_iter()
                .filter(|thread| !snoozed_thread_ids.contains(&thread.id))
                .take(limit as usize)
                .map(ThreadSummary::from)
                .collect()
        })
        .map_err(|error| error.to_string())
}

async fn list_snoozed_for_state(state: &AppState, account_id: &str) -> Result<Vec<ThreadSummary>, String> {
    let active_snoozes = state
        .snooze_repo
        .find_active_by_account(account_id, chrono::Utc::now())
        .await
        .map_err(|error| error.to_string())?;
    let mut summaries = Vec::new();

    for snooze in active_snoozes {
        if let Some(thread) = state
            .thread_repo
            .find_by_id(&snooze.thread_id)
            .await
            .map_err(|error| error.to_string())?
        {
            summaries.push(ThreadSummary::from(thread));
        }
    }

    Ok(summaries)
}

async fn snooze_thread_for_state(state: &AppState, request: SnoozeThreadRequest) -> Result<(), String> {
    let thread = state
        .thread_repo
        .find_by_id(&request.thread_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("thread not found: {}", request.thread_id))?;
    let snooze_until = chrono::DateTime::parse_from_rfc3339(&request.until)
        .map(|value| value.with_timezone(&chrono::Utc))
        .map_err(|error| error.to_string())?;
    let original_folder_id = thread
        .folder_ids
        .iter()
        .find(|folder_id| folder_id.to_lowercase().contains("inbox"))
        .cloned()
        .or_else(|| thread.folder_ids.first().cloned())
        .ok_or_else(|| "thread does not belong to a folder".to_string())?;
    let snooze = SnoozedThread {
        id: format!("snz_{}", Uuid::new_v4().simple()),
        thread_id: thread.id.clone(),
        account_id: thread.account_id.clone(),
        snooze_until,
        original_folder_id,
        created_at: chrono::Utc::now(),
    };

    state
        .snooze_repo
        .save(&snooze)
        .await
        .map_err(|error| error.to_string())
}

async fn unsnooze_thread_for_state(state: &AppState, thread_id: &str) -> Result<(), String> {
    state
        .snooze_repo
        .delete_by_thread_id(thread_id)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn wake_due_snoozed_threads_for_state(
    state: &AppState,
) -> Result<Vec<(String, String)>, String> {
    let now = chrono::Utc::now();
    let due_snoozes = state
        .snooze_repo
        .find_due(now)
        .await
        .map_err(|error| error.to_string())?;
    let mut awakened_threads = Vec::new();

    for snooze in due_snoozes {
        let Some(mut thread) = state
            .thread_repo
            .find_by_id(&snooze.thread_id)
            .await
            .map_err(|error| error.to_string())?
        else {
            state
                .snooze_repo
                .delete_by_thread_id(&snooze.thread_id)
                .await
                .map_err(|error| error.to_string())?;
            continue;
        };

        if !thread.folder_ids.contains(&snooze.original_folder_id) {
            thread.folder_ids.insert(0, snooze.original_folder_id.clone());
        }

        thread.is_unread = true;
        thread.last_message_at = now;
        thread.updated_at = now;

        state
            .thread_repo
            .save(&thread)
            .await
            .map_err(|error| error.to_string())?;
        state
            .snooze_repo
            .delete_by_thread_id(&snooze.thread_id)
            .await
            .map_err(|error| error.to_string())?;

        awakened_threads.push((snooze.account_id, snooze.thread_id));
    }

    Ok(awakened_threads)
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

    let parsed_query = parse_thread_search_query(trimmed_query);
    let search_seed = thread_search_seed(&parsed_query);

    state
        .thread_repo
        .search(account_id, &search_seed)
        .await
        .map(|threads| {
            threads
                .into_iter()
                .filter(|thread| matches_thread_search(thread, &parsed_query))
                .map(ThreadSummary::from)
                .collect()
        })
        .map_err(|error| error.to_string())
}

async fn list_messages_for_state(
    state: &AppState,
    thread_id: &str,
) -> Result<Vec<Message>, String> {
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

async fn force_sync_for_state(state: &AppState, account_id: &str) -> Result<(), String> {
    state
        .sync_manager
        .force_sync(account_id)
        .await
        .map_err(|error| error.to_string())
}

async fn get_sync_status_for_state(
    state: &AppState,
) -> Result<std::collections::HashMap<String, SyncState>, String> {
    Ok(state.sync_manager.status_snapshot().await)
}

async fn get_sync_status_detail_for_state(
    state: &AppState,
) -> Result<std::collections::HashMap<String, SyncStatusSnapshot>, String> {
    Ok(state.sync_manager.detailed_status_snapshot().await)
}

fn dispatch_plugin_hook<T: Serialize>(
    state: &AppState,
    hook: &str,
    payload: &T,
) -> Result<(), String> {
    let payload = serde_json::to_value(payload).map_err(|error| error.to_string())?;
    let mut plugin_host = state
        .plugin_host
        .lock()
        .map_err(|_| "plugin host lock poisoned".to_string())?;
    let _ = plugin_host.dispatch_hook(hook, &payload);
    Ok(())
}

async fn enqueue_outbox_message_for_state(
    state: &AppState,
    request: EnqueueOutboxMessageRequest,
) -> Result<OutboxMessage, String> {
    state
        .account_repo
        .find_by_id(&request.account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("account not found: {}", request.account_id))?;

    let outbox_message = build_outbox_message(
        request.account_id,
        MimeMessage {
            from: request.from,
            to: request.to,
            cc: request.cc,
            bcc: request.bcc,
            reply_to: request.reply_to,
            subject: request.subject,
            html_body: request.html_body,
            plain_body: request.plain_body,
            in_reply_to: request.in_reply_to,
            references: request.references,
            attachments: request.attachments,
        },
    );

    state
        .outbox_repo
        .save(&outbox_message)
        .await
        .map_err(|error| error.to_string())?;

    Ok(outbox_message)
}

async fn schedule_send_for_state(
    state: &AppState,
    request: ScheduleSendRequest,
) -> Result<ScheduledSend, String> {
    state
        .account_repo
        .find_by_id(&request.account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("account not found: {}", request.account_id))?;

    let now = chrono::Utc::now();
    let send_at = chrono::DateTime::parse_from_rfc3339(&request.send_at)
        .map_err(|error| error.to_string())?
        .with_timezone(&chrono::Utc);

    if send_at <= now {
        return Err("send_at must be in the future".into());
    }

    let scheduled_send = ScheduledSend {
        id: format!("sched_{}", Uuid::new_v4()),
        account_id: request.account_id,
        mime_message: MimeMessage {
            from: request.from,
            to: request.to,
            cc: request.cc,
            bcc: request.bcc,
            reply_to: request.reply_to,
            subject: request.subject,
            html_body: request.html_body,
            plain_body: request.plain_body,
            in_reply_to: request.in_reply_to,
            references: request.references,
            attachments: request.attachments,
        },
        send_at,
        status: ScheduledSendStatus::Pending,
        last_error: None,
        sent_at: None,
        created_at: now,
        updated_at: now,
    };

    state
        .scheduled_send_repo
        .save(&scheduled_send)
        .await
        .map_err(|error| error.to_string())?;

    Ok(scheduled_send)
}

async fn cancel_scheduled_send_for_state(
    state: &AppState,
    scheduled_send_id: &str,
) -> Result<(), String> {
    let Some(mut scheduled_send) = state
        .scheduled_send_repo
        .find_by_id(scheduled_send_id)
        .await
        .map_err(|error| error.to_string())?
    else {
        return Err(format!("scheduled send not found: {scheduled_send_id}"));
    };

    scheduled_send.status = ScheduledSendStatus::Cancelled;
    scheduled_send.updated_at = chrono::Utc::now();

    state
        .scheduled_send_repo
        .save(&scheduled_send)
        .await
        .map_err(|error| error.to_string())
}

async fn list_scheduled_sends_for_state(
    state: &AppState,
    account_id: &str,
) -> Result<Vec<ScheduledSend>, String> {
    state
        .scheduled_send_repo
        .find_by_status(account_id, ScheduledSendStatus::Pending)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn process_due_scheduled_sends_for_state(
    state: &AppState,
) -> Result<Vec<ScheduledSend>, String> {
    let due_sends = state
        .scheduled_send_repo
        .find_due(chrono::Utc::now())
        .await
        .map_err(|error| error.to_string())?;
    let mut processed_sends = Vec::new();

    for mut scheduled_send in due_sends {
        scheduled_send.status = ScheduledSendStatus::Sending;
        scheduled_send.updated_at = chrono::Utc::now();
        state
            .scheduled_send_repo
            .save(&scheduled_send)
            .await
            .map_err(|error| error.to_string())?;

        let outbox_message = build_outbox_message(
            scheduled_send.account_id.clone(),
            scheduled_send.mime_message.clone(),
        );
        state
            .outbox_repo
            .save(&outbox_message)
            .await
            .map_err(|error| error.to_string())?;

        match flush_outbox_for_state(state, &scheduled_send.account_id).await {
            Ok(_) => {
                scheduled_send.status = ScheduledSendStatus::Sent;
                scheduled_send.last_error = None;
                scheduled_send.sent_at = Some(chrono::Utc::now());
            }
            Err(error) => {
                scheduled_send.status = ScheduledSendStatus::Failed;
                scheduled_send.last_error = Some(error);
            }
        }

        scheduled_send.updated_at = chrono::Utc::now();
        state
            .scheduled_send_repo
            .save(&scheduled_send)
            .await
            .map_err(|error| error.to_string())?;
        processed_sends.push(scheduled_send);
    }

    Ok(processed_sends)
}

async fn flush_outbox_for_state(
    state: &AppState,
    account_id: &str,
) -> Result<OutboxSendReport, String> {
    let account = state
        .account_repo
        .find_by_id(account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("account not found: {account_id}"))?;
    let queued_messages = state
        .outbox_repo
        .find_by_status(account_id, OutboxStatus::Queued)
        .await
        .map_err(|error| error.to_string())?;

    for queued_message in &queued_messages {
        dispatch_plugin_hook(state, "on_message_sending", queued_message)?;
    }

    if account.connection_settings.smtp_host.ends_with("example.com") {
        let mut smtp_client = FakeSmtpClient::default();
        let report = drain_outbox_for_account(
            state.account_repo.as_ref(),
            state.outbox_repo.as_ref(),
            state.credential_store.as_ref(),
            &mut smtp_client,
            account_id,
        )
        .await
        .map_err(|error| error.to_string())?;
        dispatch_sent_message_hooks(state, &queued_messages).await?;
        return Ok(report);
    }

    let mut smtp_client = LettreSmtpClient;
    let report = drain_outbox_for_account(
        state.account_repo.as_ref(),
        state.outbox_repo.as_ref(),
        state.credential_store.as_ref(),
        &mut smtp_client,
        account_id,
    )
    .await
    .map_err(|error| error.to_string())?;
    dispatch_sent_message_hooks(state, &queued_messages).await?;
    Ok(report)
}

async fn dispatch_sent_message_hooks(
    state: &AppState,
    queued_messages: &[OutboxMessage],
) -> Result<(), String> {
    for queued_message in queued_messages {
        let Some(message) = state
            .outbox_repo
            .find_by_id(&queued_message.id)
            .await
            .map_err(|error| error.to_string())?
        else {
            continue;
        };

        if message.status == OutboxStatus::Sent {
            dispatch_plugin_hook(state, "on_message_sent", &message)?;
        }
    }

    Ok(())
}

async fn save_account_credentials_for_state(
    state: &AppState,
    request: SaveAccountCredentialsRequest,
) -> Result<(), String> {
    state
        .account_repo
        .find_by_id(&request.account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("account not found: {}", request.account_id))?;

    state
        .credential_store
        .save(
            &request.account_id,
            crate::infrastructure::sync::Credentials::Password {
                username: request.username,
                password: request.password,
            },
        )
        .map_err(|error| error.to_string())
}

fn draft_contact(account_id: &str, email: &str, is_me: bool) -> Contact {
    let now = chrono::Utc::now();

    Contact {
        id: format!("ct_{}_{}", account_id, email.replace(['@', '.'], "_")),
        account_id: account_id.into(),
        name: None,
        email: email.into(),
        is_me,
        created_at: now,
        updated_at: now,
    }
}

fn draft_snippet(body: &str) -> String {
    body.replace("<br />", " ")
        .replace("<br>", " ")
        .replace("</p>", " ")
        .replace(|character| character == '<' || character == '>', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

async fn save_draft_for_state(state: &AppState, request: SaveDraftRequest) -> Result<String, String> {
    let account = state
        .account_repo
        .find_by_id(&request.account_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("account not found: {}", request.account_id))?;
    let drafts_folder = state
        .folder_repo
        .find_by_role(&request.account_id, FolderRole::Drafts)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("drafts folder not found for account {}", request.account_id))?;
    let now = chrono::Utc::now();
    let thread_id = format!("draft_thr_{}", request.id);
    let message = Message {
        id: request.id.clone(),
        account_id: request.account_id.clone(),
        thread_id: thread_id.clone(),
        from: vec![draft_contact(&request.account_id, &account.email_address, true)],
        to: request
            .to
            .iter()
            .map(|email| draft_contact(&request.account_id, email, false))
            .collect(),
        cc: request
            .cc
            .iter()
            .map(|email| draft_contact(&request.account_id, email, false))
            .collect(),
        bcc: request
            .bcc
            .iter()
            .map(|email| draft_contact(&request.account_id, email, false))
            .collect(),
        reply_to: vec![],
        subject: request.subject.clone(),
        snippet: draft_snippet(&request.body),
        body: request.body.clone(),
        plain_text: Some(draft_snippet(&request.body)),
        message_id_header: format!("<{}@openmail.local>", request.id),
        in_reply_to: request.in_reply_to.clone(),
        references: request.references.clone(),
        folder_id: drafts_folder.id.clone(),
        label_ids: vec![],
        is_unread: false,
        is_starred: false,
        is_draft: true,
        date: now,
        attachments: vec![],
        headers: std::collections::HashMap::from([(
            "x-open-mail-draft".into(),
            "true".into(),
        )]),
        created_at: now,
        updated_at: now,
    };
    let thread = Thread {
        id: thread_id,
        account_id: request.account_id.clone(),
        subject: request.subject.clone(),
        snippet: message.snippet.clone(),
        message_count: 1,
        participant_ids: request
            .to
            .iter()
            .chain(request.cc.iter())
            .chain(request.bcc.iter())
            .cloned()
            .collect(),
        folder_ids: vec![drafts_folder.id],
        label_ids: vec![],
        has_attachments: false,
        is_unread: false,
        is_starred: false,
        last_message_at: now,
        last_message_sent_at: None,
        created_at: now,
        updated_at: now,
    };

    state
        .thread_repo
        .save(&thread)
        .await
        .map_err(|error| error.to_string())?;
    state
        .message_repo
        .save(&message)
        .await
        .map_err(|error| error.to_string())?;
    dispatch_plugin_hook(state, "on_draft_created", &message)?;
    state
        .task_queue
        .enqueue(MailTask::SyncDraftSaved {
            account_id: request.account_id,
            draft_id: request.id.clone(),
        })
        .map_err(|error| error.to_string())?;

    Ok(request.id)
}

async fn delete_draft_for_state(
    state: &AppState,
    account_id: &str,
    draft_id: &str,
) -> Result<(), String> {
    state
        .message_repo
        .delete(draft_id)
        .await
        .map_err(|error| error.to_string())?;
    let _ = state
        .thread_repo
        .delete(&format!("draft_thr_{draft_id}"))
        .await;
    state
        .task_queue
        .enqueue(MailTask::SyncDraftDeleted {
            account_id: account_id.into(),
            draft_id: draft_id.into(),
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn list_drafts_for_state(state: &AppState, account_id: &str) -> Result<Vec<Message>, String> {
    state
        .message_repo
        .find_drafts(account_id)
        .await
        .map_err(|error| error.to_string())
}

fn autodiscover_settings_for_request(email: String) -> Option<ConnectionSettings> {
    autodiscover_settings_for_email(&email)
}

fn build_oauth_authorization_url_for_request(
    request: BuildOAuthAuthorizationUrlRequest,
) -> Result<OAuthAuthorizationRequest, String> {
    let config =
        OAuthManager::provider_config(request.provider, request.client_id, request.redirect_uri)
            .map_err(|error| error.to_string())?;
    let state = request
        .state
        .filter(|state| !state.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    OAuthManager::authorization_request(&config, state, Some(&request.code_challenge))
        .map_err(|error| error.to_string())
}

fn oauth_connection_settings(provider: &AccountProvider) -> Result<ConnectionSettings, String> {
    match provider {
        AccountProvider::Gmail => Ok(ConnectionSettings {
            imap_host: "imap.gmail.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.gmail.com".into(),
            smtp_port: 465,
            smtp_security: SecurityType::Ssl,
        }),
        AccountProvider::Outlook | AccountProvider::Exchange => Ok(ConnectionSettings {
            imap_host: "outlook.office365.com".into(),
            imap_port: 993,
            imap_security: SecurityType::Ssl,
            smtp_host: "smtp.office365.com".into(),
            smtp_port: 587,
            smtp_security: SecurityType::StartTls,
        }),
        _ => Err(format!("oauth is not supported for provider {provider}")),
    }
}

async fn complete_oauth_account_for_state(
    state: &AppState,
    request: CompleteOAuthAccountRequest,
) -> Result<Account, String> {
    let config = OAuthManager::provider_config(
        request.provider.clone(),
        request.client_id.clone(),
        request.redirect_uri.clone(),
    )
    .map_err(|error| error.to_string())?;
    let tokens = OAuthManager::exchange_authorization_code(
        &config,
        &request.authorization_code,
        &request.code_verifier,
    )
    .await
    .map_err(|error| error.to_string())?;
    let credentials = OAuthManager::credentials_from_tokens(request.email.clone(), &tokens)
        .map_err(|error| error.to_string())?;
    let settings = oauth_connection_settings(&config.provider)?;

    persist_account_with_credentials(
        state,
        request.name,
        request.email,
        config.provider,
        settings,
        credentials,
    )
    .await
}

fn validate_external_url(url: &str) -> Result<String, String> {
    let trimmed_url = url.trim();
    let (scheme, _) = trimmed_url
        .split_once(':')
        .ok_or_else(|| "external URL must include a protocol".to_string())?;
    let normalized_scheme = scheme.to_ascii_lowercase();

    match normalized_scheme.as_str() {
        "http" | "https" | "mailto" => Ok(trimmed_url.to_string()),
        _ => Err(format!("external URL protocol is not allowed: {scheme}")),
    }
}

fn open_url_with_system(url: &str) -> Result<(), String> {
    let status = if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(url).status()
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .status()
    } else {
        std::process::Command::new("xdg-open").arg(url).status()
    }
    .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("system opener exited with status: {status}"))
    }
}

async fn mark_messages_read_for_state(
    state: &AppState,
    message_ids: Vec<String>,
    is_read: bool,
) -> Result<Vec<String>, String> {
    let mut updated_message_ids = Vec::new();

    for message_id in message_ids {
        let Some(mut message) = state
            .message_repo
            .find_by_id(&message_id)
            .await
            .map_err(|error| error.to_string())?
        else {
            continue;
        };

        message.is_unread = !is_read;
        message.updated_at = chrono::Utc::now();
        state
            .message_repo
            .save(&message)
            .await
            .map_err(|error| error.to_string())?;
        updated_message_ids.push(message.id);
    }

    if !updated_message_ids.is_empty() {
        let task = if is_read {
            MailTask::MarkAsRead {
                message_ids: updated_message_ids.clone(),
            }
        } else {
            MailTask::MarkAsUnread {
                message_ids: updated_message_ids.clone(),
            }
        };
        state
            .task_queue
            .enqueue(task)
            .map_err(|error| error.to_string())?;
    }

    Ok(updated_message_ids)
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
pub async fn autodiscover_settings(email: String) -> Result<Option<ConnectionSettings>, String> {
    Ok(autodiscover_settings_for_request(email))
}

#[tauri::command]
pub async fn test_imap_connection(
    state: State<'_, AppState>,
    request: TestMailConnectionRequest,
) -> Result<(), String> {
    test_imap_connection_for_state(&state, request).await
}

#[tauri::command]
pub async fn test_smtp_connection(
    state: State<'_, AppState>,
    request: TestMailConnectionRequest,
) -> Result<(), String> {
    test_smtp_connection_for_state(&state, request).await
}

#[tauri::command]
pub async fn add_account(
    state: State<'_, AppState>,
    request: AddAccountRequest,
) -> Result<Account, String> {
    add_account_for_state(&state, request).await
}

#[tauri::command]
pub async fn remove_account(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
    remove_account_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn complete_oauth_account(
    state: State<'_, AppState>,
    request: CompleteOAuthAccountRequest,
) -> Result<Account, String> {
    complete_oauth_account_for_state(&state, request).await
}

#[tauri::command]
pub async fn list_folders(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<Folder>, String> {
    list_folders_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn list_signatures(state: State<'_, AppState>) -> Result<SignatureSettings, String> {
    list_signatures_for_state(&state).await
}

#[tauri::command]
pub async fn save_signature(
    state: State<'_, AppState>,
    request: SaveSignatureRequest,
) -> Result<Signature, String> {
    save_signature_for_state(&state, request).await
}

#[tauri::command]
pub async fn delete_signature(state: State<'_, AppState>, id: String) -> Result<(), String> {
    delete_signature_for_state(&state, &id).await
}

#[tauri::command]
pub async fn set_default_signature(
    state: State<'_, AppState>,
    request: SetDefaultSignatureRequest,
) -> Result<(), String> {
    set_default_signature_for_state(&state, request).await
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
pub async fn list_snoozed(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<ThreadSummary>, String> {
    list_snoozed_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn snooze_thread(
    state: State<'_, AppState>,
    request: SnoozeThreadRequest,
) -> Result<(), String> {
    snooze_thread_for_state(&state, request).await
}

#[tauri::command]
pub async fn unsnooze_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<(), String> {
    unsnooze_thread_for_state(&state, &thread_id).await
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
pub async fn force_sync(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
    force_sync_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn get_sync_status(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, SyncState>, String> {
    get_sync_status_for_state(&state).await
}

#[tauri::command]
pub async fn get_sync_status_detail(
    state: State<'_, AppState>,
) -> Result<std::collections::HashMap<String, SyncStatusSnapshot>, String> {
    get_sync_status_detail_for_state(&state).await
}

#[tauri::command]
pub async fn enqueue_outbox_message(
    state: State<'_, AppState>,
    request: EnqueueOutboxMessageRequest,
) -> Result<OutboxMessage, String> {
    enqueue_outbox_message_for_state(&state, request).await
}

#[tauri::command]
pub async fn flush_outbox(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<OutboxSendReport, String> {
    flush_outbox_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn schedule_send(
    state: State<'_, AppState>,
    request: ScheduleSendRequest,
) -> Result<ScheduledSend, String> {
    schedule_send_for_state(&state, request).await
}

#[tauri::command]
pub async fn cancel_scheduled_send(
    state: State<'_, AppState>,
    scheduled_send_id: String,
) -> Result<(), String> {
    cancel_scheduled_send_for_state(&state, &scheduled_send_id).await
}

#[tauri::command]
pub async fn list_scheduled_sends(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<ScheduledSend>, String> {
    list_scheduled_sends_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn save_account_credentials(
    state: State<'_, AppState>,
    request: SaveAccountCredentialsRequest,
) -> Result<(), String> {
    save_account_credentials_for_state(&state, request).await
}

#[tauri::command]
pub async fn save_draft(
    state: State<'_, AppState>,
    request: SaveDraftRequest,
) -> Result<String, String> {
    save_draft_for_state(&state, request).await
}

#[tauri::command]
pub async fn delete_draft(
    state: State<'_, AppState>,
    account_id: String,
    draft_id: String,
) -> Result<(), String> {
    delete_draft_for_state(&state, &account_id, &draft_id).await
}

#[tauri::command]
pub async fn list_drafts(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<Message>, String> {
    list_drafts_for_state(&state, &account_id).await
}

#[tauri::command]
pub async fn build_oauth_authorization_url(
    request: BuildOAuthAuthorizationUrlRequest,
) -> Result<OAuthAuthorizationRequest, String> {
    build_oauth_authorization_url_for_request(request)
}

#[tauri::command]
pub async fn download_attachment(local_path: String, save_path: String) -> Result<(), String> {
    download_attachment_file(local_path, save_path)
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let safe_url = validate_external_url(&url)?;
    open_url_with_system(&safe_url)
}

#[tauri::command]
pub async fn set_tray_unread_count(
    app: tauri::AppHandle,
    unread_count: u32,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "main tray icon unavailable".to_string())?;

    let tooltip = if unread_count == 0 {
        "Open Mail".to_string()
    } else {
        format!("Open Mail • {unread_count} unread")
    };

    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())?;

    #[cfg(not(target_os = "windows"))]
    tray.set_title(if unread_count == 0 {
        None::<String>
    } else {
        Some(unread_count.to_string())
    })
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn mark_messages_read(
    state: State<'_, AppState>,
    message_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    mark_messages_read_for_state(&state, message_ids, true).await
}

#[tauri::command]
pub async fn mark_messages_unread(
    state: State<'_, AppState>,
    message_ids: Vec<String>,
) -> Result<Vec<String>, String> {
    mark_messages_read_for_state(&state, message_ids, false).await
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
    state
        .credential_store
        .save(
            &account.id,
            crate::infrastructure::sync::Credentials::Password {
                username: account.email_address.clone(),
                password: "local-development-token".into(),
            },
        )
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
            id: "fld_drafts".into(),
            account_id: account.id.clone(),
            name: "Drafts".into(),
            path: "Drafts".into(),
            role: Some(FolderRole::Drafts),
            unread_count: 0,
            total_count: 0,
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
            snippet: "Build desktop alpha aprovado, agora seguimos com pacote de release.".into(),
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
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        add_account_for_state, autodiscover_settings_for_request,
        build_oauth_authorization_url_for_request,
        complete_oauth_account_for_state, delete_draft_for_state, download_attachment_file,
        enqueue_outbox_message_for_state, flush_outbox_for_state, force_sync_for_state,
        get_config_for_state, get_message_for_state, get_sync_status_detail_for_state,
        get_sync_status_for_state, list_drafts_for_state, list_folders_for_state,
        list_messages_for_state, list_scheduled_sends_for_state, list_snoozed_for_state, list_threads_for_state,
        mailbox_overview_for_state, mark_messages_read_for_state, remove_account_for_state,
        save_draft_for_state, schedule_send_for_state, cancel_scheduled_send_for_state, process_due_scheduled_sends_for_state, search_threads_for_state, seed_demo_data,
        snooze_thread_for_state, start_sync_for_state, stop_sync_for_state,
        test_imap_connection_for_state, test_smtp_connection_for_state, update_config_for_state,
        unsnooze_thread_for_state, validate_external_url, AddAccountRequest,
        BuildOAuthAuthorizationUrlRequest, CompleteOAuthAccountRequest,
        ConnectionCredentialsRequest, EnqueueOutboxMessageRequest, SaveDraftRequest,
        ScheduleSendRequest, SnoozeThreadRequest, TestMailConnectionRequest, SNOOZED_FOLDER_ID,
        wake_due_snoozed_threads_for_state,
    };
    use crate::{
        domain::models::{
            account::{AccountProvider, SyncState},
            config::AppConfig,
            outbox::OutboxStatus,
            scheduled_send::ScheduledSendStatus,
        },
        domain::repositories::{
            AccountRepository, ConfigRepository, FolderRepository, MessageRepository,
            OutboxRepository, ScheduledSendRepository, SignatureRepository, SnoozeRepository, SyncCursorRepository, ThreadRepository,
        },
        infrastructure::{
            database::{
                repositories::{
                    account_repository::SqliteAccountRepository,
                    config_repository::SqliteConfigRepository,
                    folder_repository::SqliteFolderRepository,
                    message_repository::SqliteMessageRepository,
                    outbox_repository::SqliteOutboxRepository,
                    scheduled_send_repository::SqliteScheduledSendRepository,
                    signature_repository::SqliteSignatureRepository,
                    snooze_repository::SqliteSnoozeRepository,
                    sync_cursor_repository::SqliteSyncCursorRepository,
                    thread_repository::SqliteThreadRepository,
                },
                Database,
            },
            sync::{Credentials, InMemoryMailTaskQueue, MailAddress, SyncManager},
        },
        AppState,
    };

    const OBSERVING_HOOK_PLUGIN_TEMPLATE: &str = r#"
[plugin]
id = "{plugin_id}"
name = "Observing Hook Plugin"
version = "1.0.0"
description = "Observes backend hooks"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[backend]
entry = "backend/plugin.wasm"
hooks = [{hooks}]
"#;

    fn build_test_state() -> AppState {
        static NEXT_DB_ID: AtomicU64 = AtomicU64::new(1);
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let counter = NEXT_DB_ID.fetch_add(1, Ordering::Relaxed);
        let database_path = std::env::temp_dir().join(format!(
            "open-mail-commands-{}-{unique_suffix}-{counter}.db",
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
        let outbox_repo: Arc<dyn OutboxRepository> =
            Arc::new(SqliteOutboxRepository::new(db.clone()));
        let signature_repo: Arc<dyn SignatureRepository> =
            Arc::new(SqliteSignatureRepository::new(db.clone()));
        let scheduled_send_repo: Arc<dyn ScheduledSendRepository> =
            Arc::new(SqliteScheduledSendRepository::new(db.clone()));
        let config_repo: Arc<dyn ConfigRepository> =
            Arc::new(SqliteConfigRepository::new(db.clone()));
        let snooze_repo: Arc<dyn SnoozeRepository> =
            Arc::new(SqliteSnoozeRepository::new(db.clone()));
        let sync_cursor_repo: Arc<dyn SyncCursorRepository> =
            Arc::new(SqliteSyncCursorRepository::new(db.clone()));
        let sync_manager = Arc::new(SyncManager::new(
            account_repo.clone(),
            folder_repo.clone(),
            thread_repo.clone(),
            message_repo.clone(),
            sync_cursor_repo.clone(),
        ));

        AppState {
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
            minimize_to_tray: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            credential_store: Arc::new(
                crate::infrastructure::sync::InMemoryCredentialStore::default(),
            ),
            task_queue: Arc::new(InMemoryMailTaskQueue::default()),
            sync_cursor_repo,
            sync_manager,
            plugin_host: Arc::new(std::sync::Mutex::new(crate::plugins::PluginHost::new(
                crate::plugins::PermissionChecker::new(
                    crate::plugins::PermissionPolicy::allow_all(),
                ),
            ))),
        }
    }

    fn make_temp_plugin_dir(prefix: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "open_mail_commands_{prefix}_{}_{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("temp plugin root should exist");
        root
    }

    fn observing_hook_wasm(exports: &[&str]) -> Vec<u8> {
        let hook_exports = exports
            .iter()
            .map(|hook| {
                format!(
                    r#"(func (export "hook_{hook}") (result i32)
                        call $emit_event
                        call $get_payload_len
                    )"#
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let module = format!(
            r#"
            (module
              (import "openmail" "emit_event" (func $emit_event))
              (import "openmail" "get_payload_len" (func $get_payload_len (result i32)))
              (func (export "init") (result i32)
                i32.const 0)
              {hook_exports}
            )
            "#
        );

        wat::parse_str(module).expect("wat should compile")
    }

    fn install_observing_hook_plugin(state: &AppState, plugin_id: &str, hooks: &[&str]) {
        let root = make_temp_plugin_dir("backend_hook_plugin");
        let plugin_dir = root.join(plugin_id);
        let backend_dir = plugin_dir.join("backend");
        fs::create_dir_all(&backend_dir).expect("backend dir should exist");
        let quoted_hooks = hooks
            .iter()
            .map(|hook| format!(r#""{hook}""#))
            .collect::<Vec<_>>()
            .join(", ");
        let manifest = OBSERVING_HOOK_PLUGIN_TEMPLATE
            .replace("{plugin_id}", plugin_id)
            .replace("{hooks}", &quoted_hooks);
        fs::write(plugin_dir.join("plugin.toml"), manifest).expect("manifest should be written");
        fs::write(
            backend_dir.join("plugin.wasm"),
            observing_hook_wasm(hooks),
        )
        .expect("backend wasm should be written");

        let mut plugin_host = state.plugin_host.lock().unwrap();
        plugin_host
            .discover_plugins(&[root])
            .expect("plugin discovery should succeed");
        plugin_host
            .activate(plugin_id)
            .expect("plugin should activate");
    }

    fn emitted_event_count(state: &AppState, plugin_id: &str) -> usize {
        let plugin_host = state.plugin_host.lock().unwrap();
        plugin_host
            .get(plugin_id)
            .and_then(|plugin| plugin.instance.as_ref())
            .map(|instance| instance.emitted_events().len())
            .unwrap_or(0)
    }

    fn mail_address(email: &str) -> MailAddress {
        MailAddress {
            name: None,
            email: email.into(),
        }
    }

    fn schedule_send_request(send_at: chrono::DateTime<chrono::Utc>) -> ScheduleSendRequest {
        ScheduleSendRequest {
            account_id: "acc_demo".into(),
            from: mail_address("leco@example.com"),
            to: vec![mail_address("team@example.com")],
            cc: vec![],
            bcc: vec![],
            reply_to: None,
            subject: "Scheduled desktop alpha".into(),
            html_body: "<p>Ready later</p>".into(),
            plain_body: Some("Ready later".into()),
            in_reply_to: None,
            references: vec![],
            attachments: vec![],
            send_at: send_at.to_rfc3339(),
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
    async fn snooze_hides_thread_from_inbox_and_lists_it_in_snoozed_folder() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        snooze_thread_for_state(
            &state,
            SnoozeThreadRequest {
                thread_id: "thr_1".into(),
                until: "2026-06-01T18:00:00Z".into(),
            },
        )
        .await
        .unwrap();

        let inbox_threads = list_threads_for_state(&state, "acc_demo", "fld_inbox", 0, 25)
            .await
            .unwrap();
        let snoozed_threads = list_snoozed_for_state(&state, "acc_demo").await.unwrap();
        let folders = list_folders_for_state(&state, "acc_demo").await.unwrap();
        let snoozed_folder = folders.iter().find(|folder| folder.id == SNOOZED_FOLDER_ID).unwrap();

        assert!(inbox_threads.iter().all(|thread| thread.id != "thr_1"));
        assert!(snoozed_threads.iter().any(|thread| thread.id == "thr_1"));
        assert_eq!(snoozed_folder.total_count, 1);

        unsnooze_thread_for_state(&state, "thr_1").await.unwrap();

        let restored_inbox_threads = list_threads_for_state(&state, "acc_demo", "fld_inbox", 0, 25)
            .await
            .unwrap();
        assert!(restored_inbox_threads.iter().any(|thread| thread.id == "thr_1"));
    }

    #[tokio::test]
    async fn wake_due_snooze_restores_thread_to_inbox_and_marks_it_unread() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        snooze_thread_for_state(
            &state,
            SnoozeThreadRequest {
                thread_id: "thr_2".into(),
                until: "2020-01-01T08:00:00Z".into(),
            },
        )
        .await
        .unwrap();

        let awakened_threads = wake_due_snoozed_threads_for_state(&state).await.unwrap();
        let restored_thread = state
            .thread_repo
            .find_by_id("thr_2")
            .await
            .unwrap()
            .unwrap();
        let inbox_threads = list_threads_for_state(&state, "acc_demo", "fld_inbox", 0, 25)
            .await
            .unwrap();

        assert_eq!(awakened_threads, vec![("acc_demo".into(), "thr_2".into())]);
        assert!(restored_thread.is_unread);
        assert!(
            state
                .snooze_repo
                .find_by_thread_id("thr_2")
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(inbox_threads.first().map(|thread| thread.id.as_str()), Some("thr_2"));
    }

    #[tokio::test]
    async fn preferences_config_roundtrips_through_commands() {
        let state = build_test_state();

        let initial = get_config_for_state(&state).await.unwrap();
        assert_eq!(initial.language, "English");
        assert_eq!(initial.theme, "system");

        let updated = AppConfig {
            language: "Portuguese".into(),
            default_account_id: Some("acc_demo".into()),
            mark_as_read_on_open: false,
            show_snippets: false,
            auto_load_images: true,
            include_signature_in_replies: false,
            request_read_receipts: true,
            undo_send_delay_seconds: 15,
            launch_at_login: false,
            check_for_updates: false,
            minimize_to_tray: true,
            theme: "light".into(),
            font_size: 18,
            layout_mode: "list".into(),
            density: "compact".into(),
            thread_panel_width: 66,
            notifications_enabled: false,
            notification_sound: false,
            notification_scope: "all".into(),
            quiet_hours_start: "22:00".into(),
            quiet_hours_end: "07:00".into(),
            developer_tools_enabled: true,
            log_level: "debug".into(),
        };

        update_config_for_state(&state, updated.clone()).await.unwrap();

        let persisted = get_config_for_state(&state).await.unwrap();
        assert_eq!(persisted, updated);
    }

    #[tokio::test]
    async fn remove_account_cleans_up_backend_state() {
        let state = build_test_state();
        let request = TestMailConnectionRequest {
            settings: crate::domain::models::account::ConnectionSettings {
                imap_host: "imap.example.com".into(),
                imap_port: 993,
                imap_security: crate::domain::models::account::SecurityType::Ssl,
                smtp_host: "smtp.example.com".into(),
                smtp_port: 587,
                smtp_security: crate::domain::models::account::SecurityType::StartTls,
            },
            credentials: ConnectionCredentialsRequest {
                username: "remove@example.com".into(),
                password: "secret".into(),
            },
        };

        let account = add_account_for_state(
            &state,
            AddAccountRequest {
                name: "Remove Me".into(),
                email: "remove@example.com".into(),
                provider: AccountProvider::Imap,
                settings: request.settings,
                credentials: request.credentials,
            },
        )
        .await
        .unwrap();

        update_config_for_state(
            &state,
            AppConfig {
                default_account_id: Some(account.id.clone()),
                ..AppConfig::default()
            },
        )
        .await
        .unwrap();
        assert!(matches!(
            state.credential_store.get(&account.id).unwrap(),
            Some(Credentials::Password { .. })
        ));

        remove_account_for_state(&state, &account.id).await.unwrap();

        assert!(state.account_repo.find_by_id(&account.id).await.unwrap().is_none());
        assert_eq!(state.credential_store.get(&account.id).unwrap(), None);
        assert_eq!(
            get_config_for_state(&state).await.unwrap().default_account_id,
            None
        );
    }

    #[tokio::test]
    async fn onboarding_manual_imap_commands_test_and_persist_account() {
        let state = build_test_state();
        let request = TestMailConnectionRequest {
            settings: crate::domain::models::account::ConnectionSettings {
                imap_host: "imap.example.com".into(),
                imap_port: 993,
                imap_security: crate::domain::models::account::SecurityType::Ssl,
                smtp_host: "smtp.example.com".into(),
                smtp_port: 587,
                smtp_security: crate::domain::models::account::SecurityType::StartTls,
            },
            credentials: ConnectionCredentialsRequest {
                username: "manual@example.com".into(),
                password: "secret".into(),
            },
        };

        test_imap_connection_for_state(&state, request.clone())
            .await
            .unwrap();
        test_smtp_connection_for_state(&state, request.clone())
            .await
            .unwrap();

        let account = add_account_for_state(
            &state,
            AddAccountRequest {
                name: "Manual Account".into(),
                email: "manual@example.com".into(),
                provider: AccountProvider::Imap,
                settings: request.settings,
                credentials: request.credentials,
            },
        )
        .await
        .unwrap();

        let persisted_account = state
            .account_repo
            .find_by_id(&account.id)
            .await
            .unwrap()
            .expect("account should persist");
        let folders = state
            .folder_repo
            .find_by_account(&account.id)
            .await
            .unwrap();
        let credentials = state.credential_store.get(&account.id).unwrap();

        assert_eq!(persisted_account.email_address, "manual@example.com");
        assert!(folders.iter().any(|folder| folder.role == Some(crate::domain::models::folder::FolderRole::Inbox)));
        assert!(folders.iter().any(|folder| folder.role == Some(crate::domain::models::folder::FolderRole::Sent)));
        assert!(matches!(
            credentials,
            Some(crate::infrastructure::sync::Credentials::Password { username, password })
                if username == "manual@example.com" && password == "secret"
        ));
    }

    #[tokio::test]
    async fn onboarding_oauth_command_persists_account_with_oauth_credentials() {
        let state = build_test_state();

        let account = complete_oauth_account_for_state(
            &state,
            CompleteOAuthAccountRequest {
                provider: AccountProvider::Gmail,
                client_id: "gmail-client".into(),
                redirect_uri: "openmail://oauth/callback".into(),
                authorization_code: "sample-code".into(),
                code_verifier: "pkce-verifier".into(),
                email: "oauth@example.com".into(),
                name: "OAuth User".into(),
            },
        )
        .await
        .unwrap();

        let persisted_account = state
            .account_repo
            .find_by_id(&account.id)
            .await
            .unwrap()
            .expect("oauth account should persist");
        let credentials = state.credential_store.get(&account.id).unwrap();

        assert_eq!(persisted_account.provider, AccountProvider::Gmail);
        assert_eq!(persisted_account.connection_settings.imap_host, "imap.gmail.com");
        assert!(matches!(
            credentials,
            Some(crate::infrastructure::sync::Credentials::OAuth2 { username, access_token })
                if username == "oauth@example.com" && access_token.contains("oauth-live-gmail-sample-code")
        ));
    }

    #[test]
    fn autodiscover_returns_known_provider_settings() {
        let gmail = autodiscover_settings_for_request("user@gmail.com".into()).unwrap();
        let outlook = autodiscover_settings_for_request("user@outlook.com".into()).unwrap();
        let unknown = autodiscover_settings_for_request("user@custom.invalid".into());

        assert_eq!(gmail.imap_host, "imap.gmail.com");
        assert_eq!(gmail.smtp_port, 465);
        assert_eq!(outlook.smtp_host, "smtp.office365.com");
        assert_eq!(outlook.smtp_port, 587);
        assert!(unknown.is_none());
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
    async fn thread_search_supports_structured_filters() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let starred_from_infra =
            search_threads_for_state(&state, "acc_demo", "from:infra subject:health is:starred")
                .await
                .unwrap();
        let inbox_attachments =
            search_threads_for_state(&state, "acc_demo", "in:inbox has:attachment")
                .await
                .unwrap();
        let release_attachments =
            search_threads_for_state(&state, "acc_demo", "from:release has:attachment")
                .await
                .unwrap();
        let date_only_after = search_threads_for_state(&state, "acc_demo", "after:2026-03-13")
            .await
            .unwrap();
        let date_only_before = search_threads_for_state(&state, "acc_demo", "before:2026-03-12")
            .await
            .unwrap();

        assert_eq!(starred_from_infra.len(), 1);
        assert_eq!(starred_from_infra[0].id, "thr_2");
        assert_eq!(inbox_attachments.len(), 1);
        assert_eq!(inbox_attachments[0].id, "thr_1");
        assert!(release_attachments.is_empty());
        assert_eq!(date_only_after.len(), 3);
        assert!(date_only_before.is_empty());
    }

    #[tokio::test]
    async fn thread_search_matches_message_full_text_body() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let mut message = state
            .message_repo
            .find_by_id("msg_1")
            .await
            .unwrap()
            .expect("seeded message should exist");
        message.body = "<p>Vamos fechar a base visual com mockups auroraindexados.</p>".into();
        message.plain_text = Some("Vamos fechar a base visual com mockups auroraindexados.".into());
        state.message_repo.save(&message).await.unwrap();

        let search_results = search_threads_for_state(&state, "acc_demo", "auroraindexados")
            .await
            .unwrap();

        assert_eq!(search_results.len(), 1);
        assert_eq!(search_results[0].id, "thr_1");
    }

    #[tokio::test]
    async fn message_commands_return_thread_messages_and_selected_detail() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let thread_messages = list_messages_for_state(&state, "thr_1").await.unwrap();
        let message_id = thread_messages[0].id.clone();
        let message = get_message_for_state(&state, &message_id)
            .await
            .unwrap()
            .unwrap();

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

    #[tokio::test]
    async fn force_sync_command_restarts_account_worker() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        start_sync_for_state(&state, "acc_demo").await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        force_sync_for_state(&state, "acc_demo").await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;

        let statuses = get_sync_status_for_state(&state).await.unwrap();
        assert_eq!(statuses.get("acc_demo"), Some(&SyncState::Sleeping));
    }

    #[tokio::test]
    async fn sync_status_detail_command_returns_operational_snapshot() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        start_sync_for_state(&state, "acc_demo").await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;

        let statuses = get_sync_status_detail_for_state(&state).await.unwrap();
        let status = statuses.get("acc_demo").unwrap();

        assert_eq!(status.state, SyncState::Sleeping);
        assert!(matches!(
            status.phase,
            Some(crate::infrastructure::sync::SyncPhase::Idling)
        ));
        assert_eq!(status.folders_synced, 2);
        assert_eq!(status.messages_observed, 2);
        assert_eq!(status.folders.len(), 2);
        assert!(status.last_sync_started_at.is_some());
        assert!(status.last_sync_finished_at.is_some());
    }

    #[tokio::test]
    async fn enqueue_outbox_message_command_persists_queued_mime() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let queued = enqueue_outbox_message_for_state(
            &state,
            EnqueueOutboxMessageRequest {
                account_id: "acc_demo".into(),
                from: mail_address("leco@example.com"),
                to: vec![mail_address("team@example.com")],
                cc: vec![],
                bcc: vec![],
                reply_to: None,
                subject: "Desktop alpha".into(),
                html_body: "<p>Ready</p>".into(),
                plain_body: Some("Ready".into()),
                in_reply_to: None,
                references: vec![],
                attachments: vec![],
            },
        )
        .await
        .unwrap();

        let persisted = state
            .outbox_repo
            .find_by_id(&queued.id)
            .await
            .unwrap()
            .unwrap();
        let queued_messages = state
            .outbox_repo
            .find_by_status("acc_demo", OutboxStatus::Queued)
            .await
            .unwrap();

        assert_eq!(persisted.status, OutboxStatus::Queued);
        assert_eq!(persisted.mime_message.to[0].email, "team@example.com");
        assert_eq!(queued_messages.len(), 1);
    }

    #[tokio::test]
    async fn flush_outbox_command_sends_queued_messages() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let queued = enqueue_outbox_message_for_state(
            &state,
            EnqueueOutboxMessageRequest {
                account_id: "acc_demo".into(),
                from: mail_address("leco@example.com"),
                to: vec![mail_address("team@example.com")],
                cc: vec![],
                bcc: vec![],
                reply_to: None,
                subject: "Desktop alpha".into(),
                html_body: "<p>Ready</p>".into(),
                plain_body: Some("Ready".into()),
                in_reply_to: None,
                references: vec![],
                attachments: vec![],
            },
        )
        .await
        .unwrap();

        let report = flush_outbox_for_state(&state, "acc_demo").await.unwrap();
        let persisted = state
            .outbox_repo
            .find_by_id(&queued.id)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(report.attempted, 1);
        assert_eq!(report.sent, 1);
        assert_eq!(report.failed, 0);
        assert_eq!(persisted.status, OutboxStatus::Sent);
    }

    #[tokio::test]
    async fn flush_outbox_command_dispatches_backend_send_hooks() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();
        install_observing_hook_plugin(
            &state,
            "com.openmail.plugin.outbox-hooks",
            &["on_message_sending", "on_message_sent"],
        );

        enqueue_outbox_message_for_state(
            &state,
            EnqueueOutboxMessageRequest {
                account_id: "acc_demo".into(),
                from: mail_address("leco@example.com"),
                to: vec![mail_address("team@example.com")],
                cc: vec![],
                bcc: vec![],
                reply_to: None,
                subject: "Desktop alpha".into(),
                html_body: "<p>Ready</p>".into(),
                plain_body: Some("Ready".into()),
                in_reply_to: None,
                references: vec![],
                attachments: vec![],
            },
        )
        .await
        .unwrap();

        flush_outbox_for_state(&state, "acc_demo").await.unwrap();

        assert_eq!(
            emitted_event_count(&state, "com.openmail.plugin.outbox-hooks"),
            2
        );
    }

    #[tokio::test]
    async fn schedule_send_command_persists_pending_message() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let scheduled = schedule_send_for_state(
            &state,
            schedule_send_request(chrono::Utc::now() + chrono::Duration::hours(2)),
        )
        .await
        .unwrap();

        let persisted = state
            .scheduled_send_repo
            .find_by_id(&scheduled.id)
            .await
            .unwrap()
            .unwrap();
        let pending = list_scheduled_sends_for_state(&state, "acc_demo")
            .await
            .unwrap();

        assert_eq!(persisted.status, ScheduledSendStatus::Pending);
        assert_eq!(persisted.mime_message.subject, "Scheduled desktop alpha");
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, scheduled.id);
    }

    #[tokio::test]
    async fn cancel_scheduled_send_command_marks_item_cancelled() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let scheduled = schedule_send_for_state(
            &state,
            schedule_send_request(chrono::Utc::now() + chrono::Duration::hours(2)),
        )
        .await
        .unwrap();

        cancel_scheduled_send_for_state(&state, &scheduled.id)
            .await
            .unwrap();

        let persisted = state
            .scheduled_send_repo
            .find_by_id(&scheduled.id)
            .await
            .unwrap()
            .unwrap();
        let pending = list_scheduled_sends_for_state(&state, "acc_demo")
            .await
            .unwrap();

        assert_eq!(persisted.status, ScheduledSendStatus::Cancelled);
        assert!(pending.is_empty());
    }

    #[tokio::test]
    async fn process_due_scheduled_sends_moves_due_message_through_outbox() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let scheduled = schedule_send_for_state(
            &state,
            schedule_send_request(chrono::Utc::now() + chrono::Duration::hours(2)),
        )
        .await
        .unwrap();
        let mut persisted = state
            .scheduled_send_repo
            .find_by_id(&scheduled.id)
            .await
            .unwrap()
            .unwrap();
        persisted.send_at = chrono::Utc::now() - chrono::Duration::minutes(1);
        state.scheduled_send_repo.save(&persisted).await.unwrap();

        let processed = process_due_scheduled_sends_for_state(&state)
            .await
            .unwrap();
        let updated = state
            .scheduled_send_repo
            .find_by_id(&scheduled.id)
            .await
            .unwrap()
            .unwrap();
        let sent_outbox = state
            .outbox_repo
            .find_by_status("acc_demo", OutboxStatus::Sent)
            .await
            .unwrap();

        assert_eq!(processed.len(), 1);
        assert_eq!(processed[0].id, scheduled.id);
        assert_eq!(updated.status, ScheduledSendStatus::Sent);
        assert!(updated.sent_at.is_some());
        assert_eq!(sent_outbox.len(), 1);
        assert_eq!(sent_outbox[0].mime_message.subject, "Scheduled desktop alpha");
    }

    #[tokio::test]
    async fn mark_messages_read_updates_locally_and_queues_task() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();
        let message = list_messages_for_state(&state, "thr_1").await.unwrap()[0].clone();

        let updated_ids = mark_messages_read_for_state(&state, vec![message.id.clone()], true)
            .await
            .unwrap();
        let persisted = state
            .message_repo
            .find_by_id(&message.id)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(updated_ids, vec![message.id]);
        assert!(!persisted.is_unread);
        assert_eq!(state.task_queue.pending_count().unwrap(), 1);
    }

    #[tokio::test]
    async fn save_list_and_delete_draft_persists_backend_draft_and_queues_sync_tasks() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();

        let draft_id = save_draft_for_state(
            &state,
            SaveDraftRequest {
                id: "draft_1".into(),
                account_id: "acc_demo".into(),
                to: vec!["team@example.com".into()],
                cc: vec![],
                bcc: vec![],
                subject: "Draft subject".into(),
                body: "<p>Draft body</p>".into(),
                in_reply_to: None,
                references: vec![],
            },
        )
        .await
        .unwrap();

        let drafts = list_drafts_for_state(&state, "acc_demo").await.unwrap();
        let persisted = state
            .message_repo
            .find_by_id(&draft_id)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(drafts.len(), 1);
        assert!(persisted.is_draft);
        assert_eq!(persisted.folder_id, "fld_drafts");
        assert_eq!(state.task_queue.pending_count().unwrap(), 1);

        delete_draft_for_state(&state, "acc_demo", &draft_id)
            .await
            .unwrap();

        assert!(state.message_repo.find_by_id(&draft_id).await.unwrap().is_none());
        assert_eq!(state.task_queue.pending_count().unwrap(), 2);
    }

    #[tokio::test]
    async fn save_draft_command_dispatches_backend_draft_hook() {
        let state = build_test_state();
        seed_demo_data(&state).await.unwrap();
        install_observing_hook_plugin(
            &state,
            "com.openmail.plugin.draft-hooks",
            &["on_draft_created"],
        );

        save_draft_for_state(
            &state,
            SaveDraftRequest {
                id: "draft_hook_1".into(),
                account_id: "acc_demo".into(),
                to: vec!["team@example.com".into()],
                cc: vec![],
                bcc: vec![],
                subject: "Hooked draft".into(),
                body: "<p>Draft body</p>".into(),
                in_reply_to: None,
                references: vec![],
            },
        )
        .await
        .unwrap();

        assert_eq!(
            emitted_event_count(&state, "com.openmail.plugin.draft-hooks"),
            1
        );
    }

    #[test]
    fn oauth_authorization_command_builds_provider_url() {
        let request =
            build_oauth_authorization_url_for_request(BuildOAuthAuthorizationUrlRequest {
                provider: AccountProvider::Gmail,
                client_id: "gmail-client".into(),
                redirect_uri: "openmail://oauth/callback".into(),
                state: Some("csrf-state".into()),
                code_challenge: "challenge-value".into(),
            })
            .unwrap();

        assert_eq!(request.provider, AccountProvider::Gmail);
        assert!(request.authorization_url.contains("state=csrf-state"));
        assert!(request
            .authorization_url
            .contains("code_challenge=challenge-value"));
    }

    #[test]
    fn external_url_validation_allows_browser_and_mail_links_only() {
        assert_eq!(
            validate_external_url("https://example.com/report").unwrap(),
            "https://example.com/report"
        );
        assert_eq!(
            validate_external_url("mailto:team@example.com").unwrap(),
            "mailto:team@example.com"
        );
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn download_attachment_file_copies_local_attachment_to_selected_path() {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let source_path =
            std::env::temp_dir().join(format!("open-mail-attachment-source-{unique_suffix}.txt"));
        let save_path =
            std::env::temp_dir().join(format!("open-mail-attachment-save-{unique_suffix}.txt"));
        fs::write(&source_path, "attachment payload").unwrap();

        download_attachment_file(&source_path, &save_path).unwrap();

        assert_eq!(
            fs::read_to_string(&save_path).unwrap(),
            "attachment payload"
        );

        let _ = fs::remove_file(source_path);
        let _ = fs::remove_file(save_path);
    }
}
