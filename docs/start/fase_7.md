# Fase 7 — Features Avancadas

**Duracao estimada:** 4 semanas
**Dependencia:** Fases 1-6 concluidas
**Objetivo:** Implementar features avancadas que diferenciam o Open Mail de um cliente de email basico — snooze, send later, templates, mail rules, calendario, contatos e traducao. Estas features correspondem a ~20 plugins internos do Mailspring.

---

## Contexto

No Mailspring, cada feature avancada e um plugin independente em `internal_packages/`. No Open Mail, agrupamos features relacionadas em modulos coesos, mantendo separacao de concerns mas eliminando a fragmentacao excessiva.

---

## Mapeamento de Features

| Feature           | Mailspring Plugin(s)                          | Open Mail Modulo         | Prioridade |
|-------------------|-----------------------------------------------|--------------------------|------------|
| Snooze            | `thread-snooze/` (16 arquivos)                | `scheduling`             | P0         |
| Send Later        | `send-later/` (10 arquivos)                   | `scheduling`             | P0         |
| Send Reminders    | `send-reminders/` (17 arquivos)               | `scheduling`             | P1         |
| Templates         | `composer-templates/` (13 arquivos)           | `templates`              | P0         |
| Mail Rules        | `mail-rules-processor.ts` + `mail-rules-templates.ts` | `rules`         | P1         |
| Contacts          | `contacts/` (21 arquivos)                     | `contacts`               | P0         |
| Calendar          | `main-calendar/` (49 arquivos)                | `calendar`               | P2         |
| Translation       | `translation/` (10 arquivos)                  | `translation`            | P2         |
| Link Tracking     | `link-tracking/` (12 arquivos)                | `tracking`               | P2         |
| Open Tracking     | `open-tracking/` (18 arquivos)                | `tracking`               | P2         |
| Phishing Detection| `phishing-detection/` (19 arquivos)           | `security`               | P1         |
| Unsubscribe       | `list-unsubscribe/` (5 arquivos)              | `security`               | P1         |
| Remove Tracking   | `remove-tracking-pixels/` (7 arquivos)        | `security`               | P0 (ja em Fase 4) |
| Print             | `print/` (7 arquivos)                         | `print`                  | P1         |

---

## Entregaveis

### 7.1 — Snooze (Thread Snooze)

**Referencia Mailspring:** `app/internal_packages/thread-snooze/`

**Status atual:** `Snooze` concluido neste modulo, com persistencia backend, pasta `Snoozed`, presets, custom datetime, atalho `b`, `unsnooze` manual, wake-up automatico em background, unread-on-wake e notificacao ao despertar.

**Conceito:** Ocultar um thread temporariamente e faze-lo reaparecer no topo do inbox em data/hora especifica.

**Backend (Rust):**

```rust
// src-tauri/src/domain/models/snooze.rs
pub struct SnoozedThread {
    pub id: String,
    pub thread_id: String,
    pub account_id: String,
    pub snooze_until: DateTime<Utc>,
    pub original_folder_id: String,
    pub created_at: DateTime<Utc>,
}
```

```rust
// src-tauri/src/services/snooze_service.rs
pub struct SnoozeService {
    db: Arc<Database>,
    app: AppHandle,
}

impl SnoozeService {
    /// Snooze um thread ate a data especificada
    pub async fn snooze_thread(
        &self,
        thread_id: &str,
        until: DateTime<Utc>,
    ) -> Result<(), DomainError> {
        // 1. Salvar snooze record
        // 2. Mover thread para folder oculto (ou marcar flag)
        // 3. Agendar wake-up
    }

    /// Verifica e desperta threads snoozed
    pub async fn check_snoozed_threads(&self) -> Result<(), DomainError> {
        let now = Utc::now();
        let due = self.repo.find_due(now).await?;
        for snoozed in due {
            // Mover thread de volta para inbox
            // Marcar como unread
            // Emitir evento
            // Deletar snooze record
        }
    }

    /// Loop de verificacao (roda a cada 60s)
    pub async fn run_check_loop(&self, cancel: CancellationToken) {
        loop {
            tokio::select! {
                _ = cancel.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_secs(60)) => {
                    self.check_snoozed_threads().await.ok();
                }
            }
        }
    }
}
```

**Frontend — Snooze Popover:**

```
┌─────────────────────────┐
│     Snooze until         │
│                          │
│  Later today    (6 PM)   │
│  Tomorrow       (8 AM)   │
│  This weekend   (Sat)    │
│  Next week      (Mon)    │
│  ─────────────────────   │
│  Pick date & time...     │
└─────────────────────────┘
```

**Tauri commands:**

| Command              | Params                        | Retorno     |
|----------------------|-------------------------------|-------------|
| `snooze_thread`      | `thread_id, until`            | `()`        |
| `unsnooze_thread`    | `thread_id`                   | `()`        |
| `list_snoozed`       | `account_id`                  | `Vec<Snooze>`|

**Criterio de aceite:**
- [x] Snooze thread com opcoes pre-definidas
- [x] Snooze com data/hora custom (date picker)
- [x] Thread desaparece do inbox ao snooze
- [x] Thread reaparece no topo ao despertar
- [x] Thread marcado como unread ao despertar
- [x] Notificacao ao despertar
- [x] Lista de threads snoozed acessivel
- [x] Unsnooze (cancelar snooze)
- [x] Atalho: `b` no thread list

---

### 7.2 — Send Later

**Referencia Mailspring:** `app/internal_packages/send-later/`

**Status atual:** primeiro corte entregue, com persistencia backend, loop de processamento em background a cada `30s`, `Send later` no composer com presets + data/hora custom, auto-envio no horario e fallback local no modo web/teste. Ainda ficam abertos os fluxos visuais de draft agendado, cancelamento/edicao e UX dedicada para agendados.

**Conceito:** Agendar envio de email para data/hora futura.

**Backend (Rust):**

```rust
// src-tauri/src/domain/models/scheduled_send.rs
pub struct ScheduledSend {
    pub id: String,
    pub draft_id: String,
    pub account_id: String,
    pub send_at: DateTime<Utc>,
    pub status: ScheduledStatus,
    pub created_at: DateTime<Utc>,
}

pub enum ScheduledStatus {
    Pending,
    Sending,
    Sent,
    Failed(String),
    Cancelled,
}
```

```rust
// src-tauri/src/services/send_later_service.rs
impl SendLaterService {
    /// Agendar envio
    pub async fn schedule(
        &self,
        draft_id: &str,
        send_at: DateTime<Utc>,
    ) -> Result<ScheduledSend, DomainError>;

    /// Cancelar agendamento
    pub async fn cancel(&self, scheduled_id: &str) -> Result<(), DomainError>;

    /// Loop de verificacao (roda a cada 30s)
    pub async fn run_send_loop(&self, cancel: CancellationToken) {
        loop {
            tokio::select! {
                _ = cancel.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_secs(30)) => {
                    self.process_due_sends().await.ok();
                }
            }
        }
    }

    async fn process_due_sends(&self) -> Result<(), DomainError> {
        let due = self.repo.find_due(Utc::now()).await?;
        for scheduled in due {
            match self.send_draft(&scheduled.draft_id).await {
                Ok(_) => self.repo.mark_sent(&scheduled.id).await?,
                Err(e) => self.repo.mark_failed(&scheduled.id, &e.to_string()).await?,
            }
        }
        Ok(())
    }
}
```

**Frontend — Send Later no Composer:**

Botao dropdown ao lado de "Send":

```
┌──────────────────────┐
│ [Send]  [▾]          │
├──────────────────────┤
│ Send later...         │
│                       │
│ Tomorrow morning (8AM)│
│ Tomorrow afternoon    │
│ Monday morning        │
│ ────────────────────  │
│ Pick date & time...   │
└──────────────────────┘
```

**Criterio de aceite:**
- [x] Agendar envio com opcoes pre-definidas
- [x] Agendar com data/hora custom
- [ ] Draft marcado como "scheduled" (visual distinto)
- [x] Email enviado automaticamente no horario
- [ ] Cancelar agendamento
- [ ] Editar draft agendado (cancela e reagenda)
- [ ] Notificacao ao enviar
- [x] Funciona com app fechado (backend Tauri persiste)

---

### 7.3 — Templates

**Referencia Mailspring:** `app/internal_packages/composer-templates/`

**Conceito:** Templates reutilizaveis para emails frequentes com variaveis.

**Backend (Rust):**

```rust
pub struct EmailTemplate {
    pub id: String,
    pub name: String,
    pub subject: Option<String>,
    pub body: String,            // HTML com {{variaveis}}
    pub variables: Vec<String>,  // Nomes das variaveis detectadas
    pub account_id: Option<String>, // null = global
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

**Frontend:**

```
src/components/templates/
├── TemplateList.tsx           # Lista de templates (em Preferences)
├── TemplateEditor.tsx         # Criar/editar template
├── TemplatePickerPopover.tsx  # Popover para selecionar template no composer
└── TemplateVariableDialog.tsx # Preencher variaveis ao aplicar template
```

**Fluxo:**
1. No composer, botao "Templates" abre popover com lista
2. Selecionar template
3. Se template tem variaveis (`{{nome}}`, `{{empresa}}`), abrir dialog para preencher
4. Aplicar: subject e body preenchidos no composer

**Criterio de aceite:**
- [ ] CRUD de templates (Preferences)
- [ ] Selecionar template no composer
- [ ] Variaveis detectadas e preenchidas via dialog
- [ ] Subject do template aplicado (se definido)
- [ ] Templates por conta ou globais

---

### 7.4 — Mail Rules

**Referencia Mailspring:** `app/src/mail-rules-processor.ts`, `app/src/mail-rules-templates.ts`

**Conceito:** Regras automaticas aplicadas a emails recebidos (filtros).

**Backend (Rust):**

```rust
pub struct MailRule {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub enabled: bool,
    pub conditions: Vec<RuleCondition>,
    pub condition_mode: ConditionMode, // All / Any
    pub actions: Vec<RuleAction>,
    pub created_at: DateTime<Utc>,
}

pub enum ConditionMode { All, Any }

pub struct RuleCondition {
    pub field: RuleField,
    pub operator: RuleOperator,
    pub value: String,
}

pub enum RuleField {
    From,
    To,
    Cc,
    Subject,
    Body,
    HasAttachment,
    IsUnread,
}

pub enum RuleOperator {
    Contains,
    NotContains,
    Equals,
    StartsWith,
    EndsWith,
    Matches, // regex
}

pub enum RuleAction {
    MoveToFolder(String),
    ApplyLabel(String),
    MarkAsRead,
    Star,
    Archive,
    Trash,
    Forward(String),
}
```

**Processamento:**

```rust
impl MailRulesProcessor {
    /// Aplica regras a mensagens recem-sincronizadas
    pub async fn process_new_messages(
        &self,
        account_id: &str,
        messages: &[Message],
    ) -> Result<(), DomainError> {
        let rules = self.repo.find_enabled(account_id).await?;
        for message in messages {
            for rule in &rules {
                if self.matches(message, rule) {
                    self.apply_actions(message, &rule.actions).await?;
                }
            }
        }
        Ok(())
    }
}
```

**Frontend — Rule Builder (Preferences):**

```
┌────────────────────────────────────────────────────────────┐
│  Mail Rules                                    [+ New Rule] │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Rule: "Newsletter to Archive"              [Edit] [Delete] │
│  If ALL conditions match:                                   │
│    • From contains "newsletter"                             │
│  Then:                                                      │
│    • Move to folder: Archive                                │
│    • Mark as read                                           │
│                                                             │
│  Rule: "Important from Boss"                [Edit] [Delete] │
│  If ANY condition matches:                                  │
│    • From equals "boss@company.com"                         │
│    • Subject contains "urgent"                              │
│  Then:                                                      │
│    • Star                                                   │
│    • Apply label: Important                                 │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Criterio de aceite:**
- [ ] CRUD de regras (Preferences)
- [ ] Conditions: From, To, Subject, Body, Has Attachment
- [ ] Operators: Contains, Equals, StartsWith, EndsWith
- [ ] Actions: Move, Label, Mark Read, Star, Archive, Trash
- [ ] ALL/ANY mode para multiplas conditions
- [ ] Regras aplicadas automaticamente a novos emails
- [ ] Testar regra em emails existentes ("Run now")

---

### 7.5 — Contacts Manager

**Referencia Mailspring:** `app/internal_packages/contacts/` (21 arquivos)

**O que implementar:**

```
src/components/contacts/
├── ContactList.tsx             # Lista de contatos
├── ContactDetail.tsx           # Detalhe do contato
├── ContactCard.tsx             # Card de contato (hover em email)
├── ContactEditor.tsx           # Editar contato
└── ContactSearch.tsx           # Busca de contatos
```

**Funcionalidades:**
- Lista de contatos (auto-populada a partir de emails enviados/recebidos)
- Busca por nome ou email
- Card de contato ao hover sobre email (em message view)
- Editar nome/notas de contato
- Ver historico de emails com contato
- Contatos frequentes (ordenacao por frequencia)

**Backend:**

```rust
#[tauri::command]
pub async fn list_contacts(
    state: State<'_, AppState>,
    account_id: String,
    query: Option<String>,
    limit: u32,
    offset: u32,
) -> Result<Vec<ContactWithStats>, DomainError>;

pub struct ContactWithStats {
    pub contact: Contact,
    pub email_count: u32,
    pub last_emailed_at: Option<DateTime<Utc>>,
}
```

**Criterio de aceite:**
- [ ] Lista de contatos com busca
- [ ] Contact card on hover (message view + composer)
- [ ] Historico de emails com contato
- [ ] Editar nome/notas
- [ ] Contatos auto-populados a partir de emails

---

### 7.6 — Phishing Detection & Security

**Referencia Mailspring:** `app/internal_packages/phishing-detection/` (19 arquivos), `app/internal_packages/list-unsubscribe/` (5 arquivos)

**O que implementar:**

**Phishing Detection (Rust):**

```rust
pub struct PhishingAnalysis {
    pub is_suspicious: bool,
    pub reasons: Vec<PhishingReason>,
    pub risk_level: RiskLevel,
}

pub enum PhishingReason {
    SpoofedSender { display_name: String, actual_email: String },
    SuspiciousLinks { count: u32 },
    MismatchedDomain { link_text: String, actual_url: String },
    ReplyToMismatch { from: String, reply_to: String },
    AuthenticationFailed, // SPF/DKIM fail
}

pub enum RiskLevel { Low, Medium, High }

pub fn analyze_message(message: &Message) -> PhishingAnalysis {
    let mut reasons = vec![];

    // 1. Verificar spoofed sender
    // From: "Google <evil@phishing.com>"
    if let Some(from) = message.from.first() {
        if let Some(name) = &from.name {
            let known_brands = ["google", "apple", "microsoft", "paypal", "amazon"];
            if known_brands.iter().any(|b| name.to_lowercase().contains(b))
                && !from.email.contains(&name.to_lowercase()) {
                reasons.push(PhishingReason::SpoofedSender { ... });
            }
        }
    }

    // 2. Verificar links com domain mismatch
    // 3. Verificar reply-to diferente de from
    // 4. Verificar auth headers (SPF, DKIM)

    PhishingAnalysis {
        is_suspicious: !reasons.is_empty(),
        reasons,
        risk_level: calculate_risk(&reasons),
    }
}
```

**List-Unsubscribe:**

```rust
pub fn extract_unsubscribe_info(headers: &HashMap<String, String>) -> Option<UnsubscribeInfo> {
    headers.get("List-Unsubscribe").map(|value| {
        // Parse: <mailto:unsub@list.com>, <https://list.com/unsub>
        UnsubscribeInfo {
            mailto: extract_mailto(value),
            url: extract_url(value),
            one_click: headers.contains_key("List-Unsubscribe-Post"),
        }
    })
}
```

**Frontend:**
- Banner de warning em mensagens suspeitas
- Botao "Unsubscribe" em newsletters
- Indicadores visuais (icone de escudo)

**Criterio de aceite:**
- [ ] Phishing warning exibido em mensagens suspeitas
- [ ] Deteccao de sender spoofing
- [ ] Deteccao de link mismatch
- [ ] Botao unsubscribe em newsletters
- [ ] One-click unsubscribe (RFC 8058)

---

### 7.7 — Print

**Referencia Mailspring:** `app/internal_packages/print/`

**O que implementar:**

```rust
#[tauri::command]
pub async fn print_message(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<(), DomainError> {
    // Gerar HTML formatado para impressao
    // Abrir dialog de impressao nativo
}
```

**Frontend:**
- Botao "Print" no menu de acoes da mensagem
- Gerar HTML limpo para impressao (sem UI do app)
- Preview antes de imprimir
- Atalho: `Cmd+P`

**Criterio de aceite:**
- [ ] Print dialog nativo abre
- [ ] HTML formatado para impressao (limpo, sem UI)
- [ ] Headers do email incluidos (From, To, Date, Subject)
- [ ] Attachments listados (nao impressos)

---

### 7.8 — Send Reminders (Follow-up)

**Referencia Mailspring:** `app/internal_packages/send-reminders/`

**Conceito:** Lembrar o usuario se nao recebeu resposta a um email enviado apos X dias.

**Backend:**

```rust
pub struct SendReminder {
    pub id: String,
    pub message_id: String,
    pub thread_id: String,
    pub account_id: String,
    pub remind_at: DateTime<Utc>,
    pub status: ReminderStatus,
}

pub enum ReminderStatus {
    Active,
    Triggered,     // lembrete disparou
    Replied,       // recebeu resposta (auto-cancelado)
    Cancelled,
}
```

**Logica:**
- Ao receber resposta no thread, cancelar reminder automaticamente
- Se nao respondido ate `remind_at`, mover thread para topo do inbox + notificacao
- Opcoes de tempo: 1 dia, 3 dias, 1 semana, custom

**Criterio de aceite:**
- [ ] Adicionar reminder ao enviar email
- [ ] Reminder cancelado automaticamente se recebe resposta
- [ ] Thread movido para topo se nao respondido
- [ ] Notificacao desktop
- [ ] Lista de reminders ativos

---

## Testes desta Fase

| Tipo        | Escopo                                          | Ferramenta   |
|-------------|------------------------------------------------|--------------|
| Unit        | Snooze service (schedule, wake-up)              | `cargo test` |
| Unit        | Send Later service (schedule, send)             | `cargo test` |
| Unit        | Mail rules matching (conditions, operators)     | `cargo test` |
| Unit        | Phishing detection (spoofing, links)            | `cargo test` |
| Unit        | Template variable extraction/replacement        | Vitest       |
| Unit        | Unsubscribe header parsing                      | `cargo test` |
| Integracao  | Snooze → wake-up → inbox                       | `cargo test` |
| Integracao  | Send Later → SMTP send                          | `cargo test` |
| Integracao  | Mail rules → auto-move                          | `cargo test` |
| E2E         | Snooze thread → verify disappear → reappear     | Playwright   |

---

## Checklist Final da Fase 7

- [x] Snooze funcional (snooze, wake-up, notifications)
- [ ] Send Later funcional (schedule, auto-send, cancel)
- [ ] Templates CRUD + aplicacao no composer
- [ ] Mail Rules builder + auto-processamento
- [ ] Contacts manager com busca e historico
- [ ] Phishing detection com warnings visuais
- [ ] List-Unsubscribe funcional
- [ ] Print com formatacao limpa
- [ ] Send Reminders com auto-cancel
- [ ] Background services rodando (snooze loop, send later loop, reminder loop)
- [x] Testes passando
- [ ] CI green

---

**Fase anterior:** [Fase 6 — Account Management](./fase_6.md)
**Proxima fase:** [Fase 8 — Plugin System v2](./fase_8.md)
