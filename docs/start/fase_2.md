# Fase 2 — Sync Engine (IMAP/SMTP em Rust)

**Duracao estimada:** 4 semanas
**Dependencia:** Fase 1 concluida
**Objetivo:** Implementar o motor de sincronizacao de email em Rust, substituindo o sync engine C++ (Mailcore2) do Mailspring. Suportar IMAP para leitura e SMTP para envio.

---

## Estado de Implementacao

Atualizado em 2026-04-17.

A Fase 2 esta concluida como **fundacao local testavel** para desbloquear a Fase 3. O backend ja possui os contratos, workers, repositorios, fila de saida, parser, threading, tasks otimistas, eventos e comandos Tauri necessarios para a UI consumir dados reais do processo Rust.

Implementado no codigo:

- IMAP wrapper via trait `ImapClient`, factory injetavel e fake adapter deterministico para testes.
- SMTP wrapper via trait `SmtpClient`, fake adapter, validacao de mensagem MIME e fila persistente de outbox.
- Parser de mensagens com headers, multipart basico, attachments, HTML sanitizado e snippets.
- Sync manager por conta com start/stop/force sync, snapshots detalhados e eventos de dominio.
- Threading por `Message-ID`, `In-Reply-To`, `References`, assunto normalizado e participantes.
- Task queue para acoes otimistas de usuario, incluindo marcar mensagens como lidas/nao lidas.
- Credential store em memoria para integrar envio/sync sem persistir segredo no SQLite.
- OAuth scaffolding para Gmail/Outlook/Exchange com URL de autorizacao, escopos, PKCE e conversao de tokens para credenciais.
- Bridge TypeScript/Tauri para mailbox, sync status, outbox, tasks de leitura e OAuth authorization URL.

Fora do escopo implementado nesta passagem:

- Conexao real com servidores IMAP/SMTP usando `async-imap` e `lettre`.
- Troca real de OAuth authorization code por tokens via rede.
- Persistencia de credenciais em Keychain/Secret Service/Credential Manager.
- Execucao remota das tasks IMAP com rollback em caso de falha do servidor.

Esses pontos permanecem como hardening de integracao externa. A Fase 3 pode comecar com seguranca usando os contratos locais e fake adapters ja validados.

---

## Contexto

No Mailspring, o sync engine e um **binario C++ separado** (`mailsync`) que se comunica com o Electron via stdin/stdout JSON. Cada conta tem seu proprio processo de sync.

No Open Mail, o sync engine vive **dentro do processo Tauri** como modulos Rust async. Cada conta tem uma tokio task dedicada. A comunicacao com o frontend e via Tauri events (push reativo).

```
Mailspring:
  Electron <--stdin/stdout JSON--> mailsync (C++ process per account)

Open Mail:
  Frontend <--Tauri IPC--> Rust Backend
                              └── tokio::spawn per account
                                    ├── IMAP sync loop
                                    └── SMTP send queue
```

---

## Arquitetura do Sync Engine

```
┌─────────────────────────────────────────────┐
│              SyncManager                     │
│  (gerencia workers por conta)                │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ SyncWorker   │  │ SyncWorker   │  ...     │
│  │ (Account A)  │  │ (Account B)  │          │
│  ├─────────────┤  ├─────────────┤           │
│  │ ImapClient   │  │ ImapClient   │          │
│  │ SmtpClient   │  │ SmtpClient   │          │
│  │ FolderSync   │  │ FolderSync   │          │
│  │ MessageSync  │  │ MessageSync  │          │
│  └─────────────┘  └─────────────┘           │
│                                              │
│  EventBus (Tauri events para frontend)       │
└─────────────────────────────────────────────┘
```

---

## Crates Rust Utilizadas

| Crate            | Proposito                        | Alternativa          |
|------------------|----------------------------------|----------------------|
| `async-imap`     | Cliente IMAP async               | `imap-codec`         |
| `async-native-tls` | TLS para IMAP                 | `tokio-rustls`       |
| `lettre`         | Envio SMTP                       | `mail-send`          |
| `mail-parser`    | Parse de mensagens RFC 5322      | `mailparse`          |
| `mail-builder`   | Construir mensagens MIME         | —                    |
| `oauth2`         | OAuth2 (Gmail, Outlook)          | —                    |
| `tokio`          | Async runtime                    | —                    |
| `keyring`        | Armazenar credenciais            | `tauri-plugin-store` |

---

## Entregaveis

### 2.1 — IMAP Client Wrapper

**Referencia Mailspring:** Mailcore2 IMAP session (C++)

**O que implementar:**

```rust
// src-tauri/src/infrastructure/sync/imap_client.rs

pub struct ImapClient {
    session: Session<TlsStream<TcpStream>>,
    account_id: String,
}

impl ImapClient {
    /// Conecta ao servidor IMAP
    pub async fn connect(settings: &ConnectionSettings, credentials: &Credentials) -> Result<Self, SyncError>;

    /// Lista todas as mailboxes (folders)
    pub async fn list_folders(&mut self) -> Result<Vec<ImapFolder>, SyncError>;

    /// Seleciona uma mailbox
    pub async fn select_folder(&mut self, path: &str) -> Result<FolderStatus, SyncError>;

    /// Busca UIDs de mensagens novas (desde last_uid)
    pub async fn fetch_new_uids(&mut self, since_uid: u32) -> Result<Vec<u32>, SyncError>;

    /// Busca headers + envelope de mensagens por UID range
    pub async fn fetch_envelopes(&mut self, uids: &[u32]) -> Result<Vec<ImapEnvelope>, SyncError>;

    /// Busca body completo de uma mensagem por UID
    pub async fn fetch_body(&mut self, uid: u32) -> Result<Vec<u8>, SyncError>;

    /// Busca flags de mensagens
    pub async fn fetch_flags(&mut self, uids: &[u32]) -> Result<Vec<(u32, Vec<Flag>)>, SyncError>;

    /// Define flags em mensagens
    pub async fn set_flags(&mut self, uids: &[u32], flags: &[Flag], add: bool) -> Result<(), SyncError>;

    /// Move mensagens entre folders
    pub async fn move_messages(&mut self, uids: &[u32], destination: &str) -> Result<(), SyncError>;

    /// Copia mensagens
    pub async fn copy_messages(&mut self, uids: &[u32], destination: &str) -> Result<(), SyncError>;

    /// Deleta mensagens (marca como \Deleted + EXPUNGE)
    pub async fn delete_messages(&mut self, uids: &[u32]) -> Result<(), SyncError>;

    /// IDLE - aguarda notificacoes do servidor
    pub async fn idle(&mut self, timeout: Duration) -> Result<IdleResult, SyncError>;

    /// Append (salvar draft no servidor)
    pub async fn append(&mut self, folder: &str, message: &[u8], flags: &[Flag]) -> Result<u32, SyncError>;

    /// Desconecta
    pub async fn disconnect(self) -> Result<(), SyncError>;
}

pub struct ImapEnvelope {
    pub uid: u32,
    pub message_id: String,
    pub subject: String,
    pub from: Vec<Address>,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub date: DateTime<Utc>,
    pub flags: Vec<Flag>,
    pub size: u32,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
}

pub enum Flag {
    Seen,
    Answered,
    Flagged,
    Deleted,
    Draft,
    Custom(String),
}

pub enum IdleResult {
    NewMessages,
    FlagsChanged,
    Timeout,
    Disconnected,
}
```

**Credenciais:**

```rust
pub enum Credentials {
    Password { username: String, password: String },
    OAuth2 { username: String, access_token: String },
}
```

**Testes:**
- Teste de conexao com servidor IMAP real (integracao, skip em CI)
- Teste com mock IMAP server (unit)
- Teste de reconexao apos timeout
- Teste de IDLE
- Teste de parse de envelopes

**Criterio de aceite:**
- [ ] Conecta em servidores Gmail, Outlook, Yahoo, IMAP generico
- [ ] Suporta SSL e STARTTLS
- [ ] Suporta IDLE para push notifications
- [ ] Reconexao automatica em caso de falha
- [ ] Logging estruturado de todas as operacoes IMAP

---

### 2.2 — SMTP Client Wrapper

**O que implementar:**

```rust
// src-tauri/src/infrastructure/sync/smtp_client.rs

pub struct SmtpClient;

impl SmtpClient {
    /// Envia um email
    pub async fn send(
        settings: &ConnectionSettings,
        credentials: &Credentials,
        message: &MimeMessage,
    ) -> Result<(), SyncError>;

    /// Testa conexao SMTP
    pub async fn test_connection(
        settings: &ConnectionSettings,
        credentials: &Credentials,
    ) -> Result<(), SyncError>;
}

/// Construcao de mensagem MIME
pub struct MimeMessage {
    pub from: Address,
    pub to: Vec<Address>,
    pub cc: Vec<Address>,
    pub bcc: Vec<Address>,
    pub reply_to: Option<Address>,
    pub subject: String,
    pub html_body: String,
    pub plain_body: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub attachments: Vec<MimeAttachment>,
}

pub struct MimeAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
    pub is_inline: bool,
    pub content_id: Option<String>,
}
```

**Implementacao com `lettre`:**

```rust
use lettre::{
    transport::smtp::{authentication::Credentials as LettreCredentials, client::Tls},
    AsyncSmtpTransport, AsyncTransport, Message as LettreMessage,
};

impl SmtpClient {
    pub async fn send(
        settings: &ConnectionSettings,
        credentials: &Credentials,
        message: &MimeMessage,
    ) -> Result<(), SyncError> {
        let transport = AsyncSmtpTransport::<lettre::Tokio1Executor>::builder_dangerous(&settings.smtp_host)
            .port(settings.smtp_port)
            .tls(match settings.smtp_security {
                SecurityType::Ssl => Tls::Wrapper(/* ... */),
                SecurityType::StartTls => Tls::Required(/* ... */),
                SecurityType::None => Tls::None,
            })
            .credentials(credentials.into())
            .build();

        let email = build_lettre_message(message)?;
        transport.send(email).await.map_err(SyncError::from)?;
        Ok(())
    }
}
```

**Testes:**
- Teste de envio com servidor SMTP real (integracao, skip em CI)
- Teste de construcao de mensagem MIME (attachments, inline images, HTML + plain text)
- Teste de conexao (SSL, STARTTLS)

**Criterio de aceite:**
- [ ] Envia emails com HTML body
- [ ] Suporta attachments (inline e regular)
- [ ] Suporta multipart/alternative (HTML + plain text)
- [ ] Suporta Reply-To, In-Reply-To, References headers
- [ ] Valida conexao antes de enviar

---

### 2.3 — Message Parser

**O que implementar:**

Converter raw IMAP data (RFC 5322/MIME) em domain models:

```rust
// src-tauri/src/infrastructure/sync/message_parser.rs

pub struct MessageParser;

impl MessageParser {
    /// Converte bytes raw de uma mensagem IMAP em domain Message
    pub fn parse(raw: &[u8], account_id: &str) -> Result<ParsedMessage, SyncError>;

    /// Extrai apenas headers (sem body) para listagem rapida
    pub fn parse_headers(raw: &[u8]) -> Result<MessageHeaders, SyncError>;

    /// Sanitiza HTML do body (remove scripts, tracking pixels, etc.)
    pub fn sanitize_html(html: &str) -> String;

    /// Gera snippet (texto truncado para preview)
    pub fn generate_snippet(body: &str, max_len: usize) -> String;
}

pub struct ParsedMessage {
    pub message: Message,       // domain model
    pub attachments: Vec<AttachmentData>,
    pub raw_size: u64,
}

pub struct AttachmentData {
    pub metadata: Attachment,   // domain model
    pub data: Vec<u8>,          // conteudo binario
}
```

**Aspectos criticos:**
- Parse de MIME multipart (text/plain, text/html, mixed, alternative, related)
- Decodificacao de charsets (UTF-8, ISO-8859-1, etc.)
- Decodificacao de transfer encoding (base64, quoted-printable)
- Extracao de inline images (CID references)
- Sanitizacao de HTML (DOMPurify equivalente em Rust — usar `ammonia`)
- Geracao de snippet a partir do body

**Crate adicional:**
```toml
ammonia = "4"      # HTML sanitizer
```

**Testes:**
- Parse de email simples (text/plain)
- Parse de email HTML (text/html)
- Parse de email multipart/alternative
- Parse de email com attachments
- Parse de email com inline images
- Parse de email com charset nao-UTF8
- Parse de email com headers encodados (RFC 2047)
- Sanitizacao de HTML malicioso (XSS)

**Criterio de aceite:**
- [ ] Todos os formatos MIME comuns parseados corretamente
- [ ] HTML sanitizado (sem scripts, sem tracking pixels)
- [ ] Snippets gerados corretamente (sem tags HTML)
- [ ] Attachments extraidos com metadata e dados
- [ ] Performance: parse de 100 mensagens em <1s

---

### 2.4 — Sync Worker (por conta)

**O que implementar:**

```rust
// src-tauri/src/infrastructure/sync/sync_worker.rs

pub struct SyncWorker {
    account_id: String,
    imap: ImapClient,
    db: Arc<Database>,
    event_emitter: AppHandle,
    cancel_token: CancellationToken,
}

impl SyncWorker {
    pub fn new(account: &Account, db: Arc<Database>, app: AppHandle) -> Self;

    /// Inicia o loop de sync (roda em tokio::spawn)
    pub async fn run(&mut self) -> Result<(), SyncError> {
        loop {
            tokio::select! {
                _ = self.cancel_token.cancelled() => break,
                result = self.sync_cycle() => {
                    match result {
                        Ok(_) => self.idle_or_sleep().await?,
                        Err(e) => self.handle_error(e).await,
                    }
                }
            }
        }
        Ok(())
    }

    /// Um ciclo completo de sync
    async fn sync_cycle(&mut self) -> Result<(), SyncError> {
        // 1. Sincronizar lista de folders
        self.sync_folders().await?;

        // 2. Para cada folder prioritario (inbox primeiro):
        for folder in self.get_folders_by_priority().await? {
            self.sync_folder(&folder).await?;
        }

        Ok(())
    }

    /// Sincroniza a lista de folders da conta
    async fn sync_folders(&mut self) -> Result<(), SyncError>;

    /// Sincroniza um folder especifico
    async fn sync_folder(&mut self, folder: &Folder) -> Result<(), SyncError> {
        // 1. SELECT folder
        let status = self.imap.select_folder(&folder.path).await?;

        // 2. Verificar UIDVALIDITY (se mudou, full resync)
        let sync_state = self.get_sync_state(&folder.id).await?;
        if sync_state.uid_validity != Some(status.uid_validity) {
            return self.full_sync_folder(folder).await;
        }

        // 3. Buscar novos UIDs desde last_uid
        let new_uids = self.imap.fetch_new_uids(sync_state.last_uid.unwrap_or(0)).await?;

        // 4. Fetch envelopes + bodies em batches
        for chunk in new_uids.chunks(50) {
            let envelopes = self.imap.fetch_envelopes(chunk).await?;
            let messages = self.process_envelopes(envelopes, folder).await?;
            self.save_messages(&messages).await?;
            self.emit_changes(&messages).await;
        }

        // 5. Sync flags alteradas
        self.sync_flags(folder).await?;

        // 6. Atualizar sync state
        self.update_sync_state(folder, &status).await?;

        Ok(())
    }

    /// IDLE ou sleep entre ciclos
    async fn idle_or_sleep(&mut self) -> Result<(), SyncError> {
        // Tentar IDLE no inbox (push do servidor)
        // Fallback: sleep 60s entre ciclos
        match self.imap.idle(Duration::from_secs(300)).await {
            Ok(IdleResult::NewMessages) => Ok(()),
            Ok(IdleResult::Timeout) => Ok(()),
            Ok(_) => Ok(()),
            Err(_) => {
                tokio::time::sleep(Duration::from_secs(60)).await;
                Ok(())
            }
        }
    }

    /// Emite evento para frontend quando dados mudam
    async fn emit_changes(&self, messages: &[Message]) {
        let thread_ids: Vec<String> = messages.iter()
            .map(|m| m.thread_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();

        self.event_emitter.emit("db:threads-changed", &thread_ids).ok();
        self.event_emitter.emit("db:messages-changed", &messages.iter().map(|m| &m.id).collect::<Vec<_>>()).ok();
    }

    /// Tratamento de erros com backoff exponencial
    async fn handle_error(&mut self, error: SyncError) {
        log::error!("Sync error for account {}: {}", self.account_id, error);
        self.event_emitter.emit("sync:error", &json!({
            "accountId": self.account_id,
            "error": error.to_string(),
        })).ok();

        // Backoff: 5s, 10s, 20s, 40s, ... max 5min
        let delay = std::cmp::min(
            5 * 2u64.pow(self.error_count),
            300
        );
        self.error_count += 1;
        tokio::time::sleep(Duration::from_secs(delay)).await;
    }
}
```

**Criterio de aceite:**
- [ ] Sync incremental funciona (apenas mensagens novas)
- [ ] UIDVALIDITY verificado (full resync quando invalida)
- [ ] Folders sincronizados com roles detectados
- [ ] IDLE funciona para push notifications
- [ ] Backoff exponencial em caso de erro
- [ ] Cancellation graceful via CancellationToken
- [ ] Eventos emitidos para frontend a cada mudanca

---

### 2.5 — Sync Manager

**O que implementar:**

```rust
// src-tauri/src/infrastructure/sync/sync_manager.rs

pub struct SyncManager {
    workers: HashMap<String, (JoinHandle<()>, CancellationToken)>,
    db: Arc<Database>,
    app: AppHandle,
}

impl SyncManager {
    pub fn new(db: Arc<Database>, app: AppHandle) -> Self;

    /// Inicia sync para uma conta
    pub async fn start_sync(&mut self, account: &Account) -> Result<(), SyncError>;

    /// Para sync de uma conta
    pub async fn stop_sync(&mut self, account_id: &str) -> Result<(), SyncError>;

    /// Para sync de todas as contas
    pub async fn stop_all(&mut self) -> Result<(), SyncError>;

    /// Reinicia sync de uma conta (reconexao)
    pub async fn restart_sync(&mut self, account_id: &str) -> Result<(), SyncError>;

    /// Forca um sync imediato (pull-to-refresh)
    pub async fn force_sync(&mut self, account_id: &str) -> Result<(), SyncError>;

    /// Retorna status de sync de todas as contas
    pub fn sync_status(&self) -> HashMap<String, SyncState>;
}
```

**Tauri commands:**

```rust
#[tauri::command]
pub async fn start_sync(state: State<'_, SyncManagerState>, account_id: String) -> Result<(), String>;

#[tauri::command]
pub async fn stop_sync(state: State<'_, SyncManagerState>, account_id: String) -> Result<(), String>;

#[tauri::command]
pub async fn force_sync(state: State<'_, SyncManagerState>, account_id: String) -> Result<(), String>;

#[tauri::command]
pub async fn get_sync_status(state: State<'_, SyncManagerState>) -> Result<HashMap<String, SyncState>, String>;
```

**Criterio de aceite:**
- [ ] Gerencia multiplas contas simultaneamente
- [ ] Start/stop/restart independente por conta
- [ ] Force sync (manual refresh)
- [ ] Status de sync acessivel pelo frontend
- [ ] Cleanup correto ao fechar o app

---

### 2.6 — Threading (Agrupamento de Mensagens)

**Referencia Mailspring:** Threads sao construidos no sync engine C++

**O que implementar:**

Algoritmo de threading baseado em RFC 5256 (IMAP THREAD) ou implementacao propria baseada em `Message-ID`, `In-Reply-To` e `References` headers:

```rust
// src-tauri/src/infrastructure/sync/threading.rs

pub struct ThreadBuilder;

impl ThreadBuilder {
    /// Atribui uma mensagem a um thread existente ou cria um novo
    pub fn assign_thread(
        message: &Message,
        existing_threads: &[Thread],
        existing_messages: &[Message],
    ) -> ThreadAssignment;

    /// Reconstroi todos os threads de um folder (full rebuild)
    pub fn rebuild_threads(messages: &[Message]) -> Vec<Thread>;
}

pub enum ThreadAssignment {
    ExistingThread { thread_id: String },
    NewThread { thread: Thread },
}
```

**Logica de threading:**
1. Se `In-Reply-To` ou `References` aponta para uma mensagem existente → mesmo thread
2. Se nao, agrupar por `Subject` normalizado (sem Re:/Fwd:) + participantes
3. Atualizar metadados do thread (snippet, counts, last_message_at, flags)

**Criterio de aceite:**
- [ ] Respostas agrupadas corretamente no mesmo thread
- [ ] Forwards criam novos threads
- [ ] Thread metadata atualizado ao adicionar/remover mensagens
- [ ] Performance: threading de 10000 mensagens em <5s

---

### 2.7 — Task Execution (Actions do Usuario)

**Referencia Mailspring:** `app/src/flux/tasks/` (26 arquivos)

**O que implementar:**

Tasks que modificam estado no servidor IMAP:

```rust
// src-tauri/src/domain/tasks/mod.rs

pub enum MailTask {
    MarkAsRead { message_ids: Vec<String> },
    MarkAsUnread { message_ids: Vec<String> },
    Star { thread_ids: Vec<String> },
    Unstar { thread_ids: Vec<String> },
    MoveToFolder { thread_ids: Vec<String>, folder_id: String },
    MoveToTrash { thread_ids: Vec<String> },
    Archive { thread_ids: Vec<String> },
    ApplyLabel { thread_ids: Vec<String>, label_id: String },
    RemoveLabel { thread_ids: Vec<String>, label_id: String },
    Delete { thread_ids: Vec<String> },
    SendDraft { draft_id: String },
    SaveDraft { draft: DraftData },
}
```

**Fluxo de execucao:**
1. Frontend chama Tauri command (`mark_as_read`, `move_to_folder`, etc.)
2. Backend aplica mudanca **local** no SQLite imediatamente (otimistic update)
3. Backend enfileira operacao IMAP
4. Backend executa operacao IMAP em background
5. Se falha IMAP, reverte mudanca local e notifica frontend

```rust
// src-tauri/src/commands/tasks.rs

#[tauri::command]
pub async fn mark_as_read(
    state: State<'_, AppState>,
    message_ids: Vec<String>,
) -> Result<(), DomainError> {
    // 1. Update local
    state.message_repo.set_read(&message_ids, true).await?;

    // 2. Emit change event
    state.app.emit("db:messages-changed", &message_ids)?;

    // 3. Queue IMAP operation
    state.task_queue.enqueue(MailTask::MarkAsRead { message_ids }).await;

    Ok(())
}

#[tauri::command]
pub async fn move_to_folder(
    state: State<'_, AppState>,
    thread_ids: Vec<String>,
    folder_id: String,
) -> Result<(), DomainError> {
    // 1. Update local
    state.thread_repo.move_to_folder(&thread_ids, &folder_id).await?;

    // 2. Emit
    state.app.emit("db:threads-changed", &thread_ids)?;

    // 3. Queue IMAP
    state.task_queue.enqueue(MailTask::MoveToFolder { thread_ids, folder_id }).await;

    Ok(())
}

#[tauri::command]
pub async fn send_draft(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<(), DomainError> {
    // 1. Buscar draft
    let draft = state.message_repo.find_by_id(&draft_id).await?
        .ok_or(DomainError::NotFound { entity_type: "Message".into(), id: draft_id.clone() })?;

    // 2. Construir MIME message
    let mime = build_mime_message(&draft)?;

    // 3. Enviar via SMTP
    SmtpClient::send(&account.connection_settings, &credentials, &mime).await?;

    // 4. Mover para Sent folder localmente
    state.message_repo.mark_as_sent(&draft_id).await?;

    // 5. Append no Sent folder IMAP
    state.task_queue.enqueue(MailTask::AppendToSent { message: mime }).await;

    Ok(())
}
```

**Tauri commands de task:**

| Command              | Params                                | Efeito IMAP              |
|----------------------|---------------------------------------|--------------------------|
| `mark_as_read`       | `message_ids`                         | +\Seen                   |
| `mark_as_unread`     | `message_ids`                         | -\Seen                   |
| `star_threads`       | `thread_ids`                          | +\Flagged                |
| `unstar_threads`     | `thread_ids`                          | -\Flagged                |
| `move_to_folder`     | `thread_ids, folder_id`               | MOVE/COPY+DELETE         |
| `move_to_trash`      | `thread_ids`                          | MOVE to Trash            |
| `archive_threads`    | `thread_ids`                          | MOVE to Archive/All      |
| `apply_label`        | `thread_ids, label_id`                | Gmail: +label            |
| `remove_label`       | `thread_ids, label_id`                | Gmail: -label            |
| `delete_permanently` | `thread_ids`                          | \Deleted + EXPUNGE       |
| `send_draft`         | `draft_id`                            | SMTP send + Sent append  |
| `save_draft`         | `draft_data`                          | Drafts folder append     |

**Criterio de aceite:**
- [ ] Optimistic update local funciona (UI atualiza imediato)
- [ ] Operacoes IMAP executadas em background
- [ ] Rollback local em caso de falha IMAP
- [ ] Envio de email funciona (SMTP + append em Sent)
- [ ] Save draft funciona (local + IMAP Drafts)

---

### 2.8 — OAuth2 Authentication

**O que implementar:**

Suporte a OAuth2 para Gmail, Outlook e outros provedores que nao aceitam mais app passwords:

```rust
// src-tauri/src/infrastructure/sync/oauth.rs

pub struct OAuthManager;

impl OAuthManager {
    /// Inicia fluxo OAuth2 (abre browser para autorizacao)
    pub async fn start_auth_flow(
        provider: AccountProvider,
        app: &AppHandle,
    ) -> Result<OAuthTokens, SyncError>;

    /// Refresh de access token
    pub async fn refresh_token(
        provider: AccountProvider,
        refresh_token: &str,
    ) -> Result<OAuthTokens, SyncError>;

    /// Revoga tokens
    pub async fn revoke(
        provider: AccountProvider,
        tokens: &OAuthTokens,
    ) -> Result<(), SyncError>;
}

pub struct OAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: DateTime<Utc>,
}

/// Configuracoes por provedor
pub fn oauth_config(provider: AccountProvider) -> OAuthConfig {
    match provider {
        AccountProvider::Gmail => OAuthConfig {
            auth_url: "https://accounts.google.com/o/oauth2/v2/auth",
            token_url: "https://oauth2.googleapis.com/token",
            scopes: vec!["https://mail.google.com/"],
            // client_id e client_secret vem de env vars ou config
        },
        AccountProvider::Outlook => OAuthConfig {
            auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            scopes: vec![
                "https://outlook.office365.com/IMAP.AccessAsUser.All",
                "https://outlook.office365.com/SMTP.Send",
                "offline_access",
            ],
        },
        _ => panic!("OAuth not supported for {:?}", provider),
    }
}
```

**Fluxo:**
1. App abre URL de autorizacao no browser do sistema
2. Usuario autoriza
3. Browser redireciona para `openmail://oauth/callback?code=...`
4. Tauri captura deep link via protocol handler
5. App troca authorization code por tokens
6. Tokens armazenados no keychain do OS

**Criterio de aceite:**
- [ ] OAuth2 funciona com Gmail
- [ ] OAuth2 funciona com Outlook
- [ ] Refresh automatico de token expirado
- [ ] Tokens armazenados de forma segura (keychain)
- [ ] Deep link handler registrado (`openmail://`)

---

### 2.9 — Credential Storage

**O que implementar:**

```rust
// src-tauri/src/infrastructure/keychain.rs

pub struct CredentialStore;

impl CredentialStore {
    /// Salva credencial para uma conta
    pub fn save(account_id: &str, credentials: &Credentials) -> Result<(), SyncError>;

    /// Recupera credencial
    pub fn get(account_id: &str) -> Result<Option<Credentials>, SyncError>;

    /// Remove credencial
    pub fn delete(account_id: &str) -> Result<(), SyncError>;
}
```

**Backends:**
- macOS: Keychain via `security-framework`
- Linux: Secret Service (GNOME Keyring) via `keyring`
- Windows: Credential Manager via `keyring`

**Criterio de aceite:**
- [ ] Credenciais nunca armazenadas em plain text
- [ ] Funciona em macOS, Linux e Windows
- [ ] Recuperacao transparente (app nao pede senha novamente)

---

## Testes desta Fase

| Tipo        | Escopo                                         | Ferramenta   |
|-------------|-------------------------------------------------|--------------|
| Unit        | IMAP envelope parsing                           | `cargo test` |
| Unit        | Message parser (MIME, headers, attachments)      | `cargo test` |
| Unit        | Threading algorithm                             | `cargo test` |
| Unit        | HTML sanitization                               | `cargo test` |
| Integracao  | IMAP client com servidor real                   | `cargo test` (feature flag) |
| Integracao  | SMTP send com servidor real                     | `cargo test` (feature flag) |
| Integracao  | OAuth2 flow                                     | Manual       |
| Integracao  | Sync worker (cycle completo)                    | `cargo test` |

---

## Riscos desta Fase

| Risco                                        | Impacto | Mitigacao                                  |
|----------------------------------------------|---------|--------------------------------------------|
| Variabilidade entre servidores IMAP          | Alto    | Testar com Gmail, Outlook, Yahoo, Fastmail |
| OAuth2 requer client_id registrado           | Medio   | Registrar app no Google/Microsoft console  |
| IDLE nao suportado em todos os servidores    | Baixo   | Fallback para polling com intervalo         |
| Mensagens com encoding exotico               | Medio   | mail-parser cobre maioria dos edge cases   |
| Rate limiting por provedores                 | Baixo   | Backoff + respeitar IMAP THROTTLE response |

---

## Checklist Final da Fase 2

- [x] IMAP client funcional como wrapper/fake adapter local (connect, fetch envelopes, idle)
- [x] SMTP client funcional como wrapper/fake adapter local (send, test connection)
- [x] Message parser implementado para MIME comum, attachments, HTML sanitizado e snippets
- [x] Sync worker com ciclo incremental local, IDLE fake e snapshots operacionais
- [x] Sync manager gerenciando multiplas contas com start/stop/force sync
- [x] Threading de mensagens funcionando
- [x] Task system com optimistic update local e fila de operacoes
- [x] OAuth2 scaffolding para Gmail, Outlook e Exchange
- [x] Tauri events para push reativo ao frontend
- [x] Testes passando localmente
- [ ] IMAP/SMTP real com provedores externos
- [ ] Troca/refresh OAuth2 real via rede
- [ ] Credenciais no keychain do OS
- [ ] Rollback local em caso de falha IMAP real
- [ ] CI green (GitHub Actions desativado temporariamente)

---

**Fase anterior:** [Fase 1 — Domain Models & Database](./fase_1.md)
**Proxima fase:** [Fase 3 — UI Shell & Layout System](./fase_3.md)
