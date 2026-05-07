# Fase 8 — Plugin System v2

**Duracao estimada:** 3 semanas
**Dependencia:** Fases 1-6 concluidas (Fase 7 pode rodar em paralelo)
**Objetivo:** Projetar e implementar um novo sistema de plugins para o Open Mail — seguro, sandboxed, extensivel e com API estavel. Substituir o sistema acoplado ao Electron do Mailspring por um baseado em WASM (backend) e component injection (frontend).

---

## Contexto

### Mailspring (sistema atual)

O Mailspring tem um sistema de plugins poderoso mas com limitacoes criticas:

| Caracteristica                     | Detalhe                                          |
|------------------------------------|--------------------------------------------------|
| **Runtime**                        | Node.js (mesmo processo do Electron)             |
| **Sandboxing**                     | Nenhum — acesso total a APIs                     |
| **Discovery**                      | Scan de diretorios (`internal_packages/`, `~/.config/Mailspring/packages/`) |
| **Registries**                     | ComponentRegistry, ExtensionRegistry, CommandRegistry, SoundRegistry |
| **Lifecycle**                      | `activate()` / `deactivate()` / `serialize()`    |
| **UI injection**                   | Via roles e locations no ComponentRegistry        |
| **Config**                         | Schema no `package.json` + `configDefaults`      |
| **Plugins internos**               | 48 packages (mesma arquitetura que externos)      |
| **Limitacoes**                     | Sem marketplace, sem sandboxing, sem updates automaticos |

### Open Mail (sistema novo)

| Caracteristica                     | Detalhe                                          |
|------------------------------------|--------------------------------------------------|
| **Runtime backend**                | WASM via wasmtime (sandboxed)                    |
| **Runtime frontend**              | JavaScript modules (import dinâmico)             |
| **Sandboxing**                     | WASM isolado + permissions declarativas          |
| **Discovery**                      | Diretorio local + registry remoto (futuro)       |
| **Registries**                     | ComponentSlot, CommandRegistry, HookRegistry     |
| **Lifecycle**                      | `init()` / `activate()` / `deactivate()`         |
| **UI injection**                   | Slots nomeados + React lazy components           |
| **Config**                         | Schema JSON + Preferences UI auto-gerada         |
| **Permissions**                    | Declarativas (network, filesystem, database, notifications) |

---

## Arquitetura do Plugin System

```
┌────────────────────────────────────────────────────────────┐
│                    Open Mail App                            │
├─────────────────────────┬──────────────────────────────────┤
│    Frontend (React)     │        Backend (Rust)             │
│                         │                                   │
│  ┌───────────────────┐  │  ┌─────────────────────────────┐ │
│  │ PluginManager (FE)│  │  │ PluginHost (BE)             │ │
│  │                   │  │  │                              │ │
│  │ • ComponentSlots  │  │  │ • WASM Runtime (wasmtime)   │ │
│  │ • HookRegistry    │  │  │ • Permission Checker        │ │
│  │ • CommandRegistry │  │  │ • Plugin Lifecycle           │ │
│  │ • Dynamic imports │  │  │ • Event Bus                 │ │
│  └───────┬───────────┘  │  └──────────┬──────────────────┘ │
│          │              │             │                     │
│  ┌───────▼───────────┐  │  ┌──────────▼──────────────────┐ │
│  │ Plugin A (UI)     │  │  │ Plugin A (Logic/WASM)       │ │
│  │ React components  │  │  │ message hooks, data access  │ │
│  └───────────────────┘  │  └─────────────────────────────┘ │
│  ┌───────────────────┐  │  ┌─────────────────────────────┐ │
│  │ Plugin B (UI)     │  │  │ Plugin B (Logic/WASM)       │ │
│  └───────────────────┘  │  └─────────────────────────────┘ │
└─────────────────────────┴──────────────────────────────────┘
```

---

## Entregaveis

### 8.1 — Plugin Manifest Schema

**Status atual:** primeiro corte entregue no backend Rust, com `plugin.toml` parseado via `serde`/`toml`, tipos fortemente definidos para metadata, permissions, frontend/backend/config, validacao semantica de campos obrigatorios e cobertura de testes para manifest valido, invalido e carregamento a partir de arquivo.

**O que implementar:**

Cada plugin e definido por um `plugin.toml` (ou `plugin.json`):

```toml
# plugin.toml
[plugin]
id = "com.openmail.plugin.send-later"
name = "Send Later"
version = "1.0.0"
description = "Schedule emails to be sent at a specific time"
author = "Open Mail Team"
license = "MIT"
min_app_version = "1.0.0"

[permissions]
# Declarar o que o plugin precisa acessar
database = ["read:messages", "write:scheduled_sends"]
network = false
filesystem = false
notifications = true
commands = ["send_draft"]

[frontend]
# Componentes UI do plugin
entry = "ui/index.js"
slots = [
  { name = "composer:send-button-dropdown", component = "SendLaterButton" },
  { name = "preferences:section", component = "SendLaterPreferences" },
]

[backend]
# Logica de backend (WASM)
entry = "backend/plugin.wasm"
hooks = [
  "on_message_received",
  "on_draft_created",
]
commands = [
  { name = "schedule_send", handler = "handle_schedule_send" },
  { name = "cancel_scheduled", handler = "handle_cancel_scheduled" },
]

[config]
# Schema de configuracao (auto-gera UI em Preferences)
[config.fields.default_delay]
type = "select"
label = "Default delay"
options = ["1 hour", "2 hours", "Tomorrow morning", "Custom"]
default = "1 hour"

[config.fields.morning_time]
type = "time"
label = "Morning time"
default = "08:00"
```

**Validacao de manifest:**

```rust
pub struct PluginManifest {
    pub plugin: PluginMeta,
    pub permissions: PluginPermissions,
    pub frontend: Option<FrontendConfig>,
    pub backend: Option<BackendConfig>,
    pub config: Option<ConfigSchema>,
}

impl PluginManifest {
    pub fn validate(&self) -> Result<(), Vec<ValidationError>>;
    pub fn from_file(path: &Path) -> Result<Self, ManifestError>;
}
```

**Criterio de aceite:**
- [x] Schema de manifest definido e documentado
- [x] Validacao de manifest implementada
- [x] Permissions declarativas
- [x] Frontend e backend opcionais (plugin pode ser so UI ou so logica)

---

### 8.2 — Plugin Host (Backend/Rust)

**Status atual:** terceiro corte entregue no backend Rust, com `PluginHost` em memoria, discovery de `plugin.toml` em diretorios locais, registro por `plugin_id`, estados `Installed/Active/Disabled/Error`, ativacao/desativacao inicial, verificacao de permissions antes de ativar, runtime WASM via `wasmtime`, contrato inicial de exports (`init`, `hook_*`, `command_*`) e imports host-side permissionados por manifest. O host agora valida imports `openmail::*` contra as permissions declaradas antes de instanciar o modulo, expondo apenas APIs permitidas como `db_query`, `db_execute`, `send_notification`, `http_request`, `read_file` e `write_file`. Os proximos cortes ficam mais focados em APIs reais por tras desses imports e na camada frontend do plugin system.

**O que implementar:**

```rust
// src-tauri/src/plugins/host.rs

pub struct PluginHost {
    plugins: HashMap<String, LoadedPlugin>,
    wasm_engine: wasmtime::Engine,
    permission_checker: PermissionChecker,
    event_bus: EventBus,
}

struct LoadedPlugin {
    manifest: PluginManifest,
    instance: Option<WasmInstance>,  // None se plugin e so frontend
    state: PluginState,
}

pub enum PluginState {
    Installed,
    Active,
    Disabled,
    Error(String),
}

impl PluginHost {
    /// Descobre plugins nos diretorios configurados
    pub fn discover_plugins(&mut self, dirs: &[PathBuf]) -> Result<Vec<PluginManifest>, PluginError>;

    /// Ativa um plugin
    pub async fn activate(&mut self, plugin_id: &str) -> Result<(), PluginError> {
        let plugin = self.plugins.get_mut(plugin_id)
            .ok_or(PluginError::NotFound(plugin_id.into()))?;

        // Verificar permissions
        self.permission_checker.check(&plugin.manifest.permissions)?;

        // Carregar WASM se tem backend
        if let Some(backend_config) = &plugin.manifest.backend {
            let wasm_bytes = std::fs::read(&backend_config.entry)?;
            let instance = self.create_wasm_instance(&wasm_bytes, &plugin.manifest)?;
            instance.call_init()?;
            plugin.instance = Some(instance);
        }

        plugin.state = PluginState::Active;
        Ok(())
    }

    /// Desativa um plugin
    pub async fn deactivate(&mut self, plugin_id: &str) -> Result<(), PluginError>;

    /// Despacha evento para plugins que registraram hook
    pub async fn dispatch_hook(&self, hook: &str, data: &serde_json::Value) -> Vec<HookResult>;

    /// Executa command de plugin
    pub async fn execute_command(
        &self,
        plugin_id: &str,
        command: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, PluginError>;
}
```

**WASM Sandbox:**

```rust
// src-tauri/src/plugins/wasm_runtime.rs

struct WasmInstance {
    store: wasmtime::Store<PluginContext>,
    instance: wasmtime::Instance,
}

struct PluginContext {
    plugin_id: String,
    permissions: PluginPermissions,
    db_handle: Option<Arc<Database>>,  // so se tem permission database
}

impl WasmInstance {
    fn create(
        engine: &wasmtime::Engine,
        wasm_bytes: &[u8],
        manifest: &PluginManifest,
    ) -> Result<Self, PluginError> {
        let module = wasmtime::Module::new(engine, wasm_bytes)?;
        let mut linker = wasmtime::Linker::new(engine);

        // Expor apenas APIs permitidas pelas permissions
        if manifest.permissions.database.is_some() {
            linker.func_wrap("openmail", "db_query", |/* ... */| { /* ... */ })?;
        }
        if manifest.permissions.notifications {
            linker.func_wrap("openmail", "send_notification", |/* ... */| { /* ... */ })?;
        }
        // ... mais APIs baseadas em permissions

        let store = wasmtime::Store::new(engine, PluginContext { /* ... */ });
        let instance = linker.instantiate(&mut store, &module)?;
        Ok(Self { store, instance })
    }

    fn call_init(&mut self) -> Result<(), PluginError>;
    fn call_hook(&mut self, hook: &str, data: &[u8]) -> Result<Vec<u8>, PluginError>;
    fn call_command(&mut self, command: &str, args: &[u8]) -> Result<Vec<u8>, PluginError>;
}
```

**Host API exposta ao WASM:**

| API                      | Permission Required | Descricao                         |
|--------------------------|---------------------|-----------------------------------|
| `db_query(sql)`          | `database:read`     | Query somente leitura             |
| `db_execute(sql)`        | `database:write`    | Inserir/atualizar/deletar         |
| `send_notification(msg)` | `notifications`     | Enviar notificacao desktop        |
| `http_request(url, ...)`| `network`           | Fazer request HTTP                |
| `read_file(path)`        | `filesystem:read`   | Ler arquivo                       |
| `write_file(path, data)` | `filesystem:write`  | Escrever arquivo                  |
| `emit_event(name, data)` | (sempre disponivel) | Emitir evento para frontend       |
| `log(level, msg)`        | (sempre disponivel) | Logging                           |
| `get_config(key)`        | (sempre disponivel) | Ler config do plugin              |
| `set_config(key, value)` | (sempre disponivel) | Salvar config do plugin           |

**Criterio de aceite:**
- [x] Plugin host descobre e carrega plugins
- [x] WASM runtime funcional (wasmtime)
- [x] Permission checking antes de ativar
- [x] APIs sandboxed (so acessivel com permission)
- [x] Hook dispatch funciona
- [x] Command execution funciona
- [x] Plugin isolation (crash de plugin nao derruba app)

---

### 8.3 — Plugin Manager (Frontend)

**Status atual:** primeiro corte entregue no frontend, com `PluginManager` singleton em memoria, `dynamic import` de plugins por manifest, registro de slots/commands/hooks, `PluginSlot` com `useSyncExternalStore`, `Suspense` e error boundary por plugin, além de integração real nos slots `status-bar:left`, `status-bar:right` e `preferences:section`. O bootstrap automatico de plugins instalados e a expansao para os demais slots ainda ficam para os proximos cortes.

**O que implementar:**

```typescript
// src/plugins/plugin-manager.ts

class PluginManager {
  private plugins: Map<string, LoadedFrontendPlugin> = new Map();
  private slots: Map<string, SlotRegistration[]> = new Map();
  private commands: Map<string, CommandHandler> = new Map();
  private hooks: Map<string, HookHandler[]> = new Map();

  /// Carrega plugins do frontend (dynamic import)
  async loadPlugin(manifest: PluginManifest): Promise<void> {
    if (!manifest.frontend) return;

    const module = await import(/* @vite-ignore */ manifest.frontend.entry);
    const plugin = module.default as FrontendPlugin;

    // Registrar slots
    for (const slot of manifest.frontend.slots) {
      this.registerSlot(slot.name, {
        pluginId: manifest.plugin.id,
        component: plugin.components[slot.component],
      });
    }

    // Chamar activate
    if (plugin.activate) {
      plugin.activate({
        registerCommand: (name, handler) => this.commands.set(`${manifest.plugin.id}:${name}`, handler),
        registerHook: (name, handler) => this.addHook(name, handler),
        getConfig: (key) => this.getPluginConfig(manifest.plugin.id, key),
      });
    }

    this.plugins.set(manifest.plugin.id, { manifest, module: plugin });
  }

  /// Retorna componentes registrados para um slot
  getSlotComponents(slotName: string): React.ComponentType[] {
    return (this.slots.get(slotName) || [])
      .map(reg => reg.component);
  }
}

// Singleton
export const pluginManager = new PluginManager();
```

**Plugin Slots (pontos de extensao na UI):**

| Slot Name                          | Local na UI                    | Props recebidos          |
|------------------------------------|--------------------------------|--------------------------|
| `sidebar:section`                  | Sidebar, apos folders          | `{ accountId }`          |
| `toolbar:right`                    | Toolbar, lado direito          | `{}`                     |
| `composer:send-button-dropdown`    | Dropdown do botao Send         | `{ draftId }`            |
| `composer:toolbar`                 | Toolbar do composer            | `{ editor }`             |
| `composer:footer`                  | Footer do composer             | `{ draftId }`            |
| `message:header`                   | Header de mensagem             | `{ message }`            |
| `message:footer`                   | Footer de mensagem             | `{ message }`            |
| `message:body-header`              | Antes do body da mensagem      | `{ message }`            |
| `thread-list:item-icon`            | Icone no thread list item      | `{ thread }`             |
| `thread-list:quick-action`         | Quick action no thread item    | `{ thread }`             |
| `thread:toolbar`                   | Toolbar de acoes do thread     | `{ threadId }`           |
| `preferences:section`              | Secao em Preferences           | `{ config }`             |
| `status-bar:left`                  | Status bar, lado esquerdo      | `{}`                     |
| `status-bar:right`                 | Status bar, lado direito       | `{}`                     |

**Componente PluginSlot:**

```tsx
// src/plugins/PluginSlot.tsx
export function PluginSlot({ name, props }: { name: string; props?: Record<string, any> }) {
  const components = useMemo(() => pluginManager.getSlotComponents(name), [name]);

  return (
    <>
      {components.map((Component, index) => (
        <ErrorBoundary key={index} fallback={null}>
          <Suspense fallback={null}>
            <Component {...props} />
          </Suspense>
        </ErrorBoundary>
      ))}
    </>
  );
}
```

**Uso nos componentes:**

```tsx
// Em ComposerFooter.tsx
<div className="flex items-center gap-2">
  <PluginSlot name="composer:footer" props={{ draftId }} />
  <Button>Send</Button>
</div>
```

**Criterio de aceite:**
- [x] Dynamic import de plugins frontend
- [x] Slot system funcional (registro + render)
- [x] Error boundary por plugin (crash isolado)
- [x] Command registry frontend
- [x] Hook registry frontend
- [x] Plugin config acessivel

---

### 8.4 — Plugin SDK

**O que implementar:**

SDK para desenvolvedores criarem plugins:

**Frontend SDK (npm package):**

```typescript
// @openmail/plugin-sdk

export interface FrontendPlugin {
  components: Record<string, React.ComponentType<any>>;
  activate?: (ctx: PluginContext) => void;
  deactivate?: () => void;
}

export interface PluginContext {
  registerCommand: (name: string, handler: CommandHandler) => void;
  registerHook: (name: string, handler: HookHandler) => void;
  getConfig: <T>(key: string) => T;
  setConfig: (key: string, value: any) => void;
  invoke: <T>(command: string, args?: Record<string, any>) => Promise<T>;
}

export type CommandHandler = (args: any) => void | Promise<void>;
export type HookHandler = (data: any) => any | Promise<any>;
```

**Backend SDK (Rust crate):**

```rust
// openmail-plugin-sdk crate

/// Trait que todo plugin backend deve implementar
pub trait Plugin {
    fn init(&mut self, ctx: &PluginContext) -> Result<(), PluginError>;
    fn handle_hook(&mut self, hook: &str, data: &[u8]) -> Result<Vec<u8>, PluginError>;
    fn handle_command(&mut self, command: &str, args: &[u8]) -> Result<Vec<u8>, PluginError>;
}

pub struct PluginContext {
    pub config: ConfigAccess,
    pub db: Option<DatabaseAccess>,
    pub notifications: Option<NotificationAccess>,
}
```

**Template de plugin:**

```
openmail-plugin-template/
├── plugin.toml
├── ui/
│   ├── package.json
│   ├── index.ts
│   └── components/
│       └── MyButton.tsx
├── backend/
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
└── README.md
```

**Criterio de aceite:**
- [ ] SDK frontend publicavel como npm package
- [ ] SDK backend publicavel como Rust crate
- [ ] Template de plugin funcional
- [ ] Documentacao do SDK
- [ ] Plugin de exemplo funcional (ex: word count no composer)

---

### 8.5 — Plugin Management UI

**Status atual:** terceiro corte entregue em `Preferences`, integrado ao `pluginManager` frontend. O app agora lista plugins frontend registrados, mostra metadata basica, exibe permissions declaradas com destaque para `network` e `filesystem`, permite habilitar/desabilitar plugins conhecidos sem reiniciar a shell, auto-gera controles de configuracao a partir do schema do manifest e preserva esses valores mesmo quando o plugin e desativado e reativado. Tambem existe um primeiro fluxo de `install/uninstall` no frontend, lendo `plugin.json` por arquivo e registrando/removendo o plugin do manager em tempo real. O suporte completo a bundle `zip/folder` ainda fica como proximo passo.

**O que implementar:**

```
src/components/preferences/
└── PreferencesPlugins.tsx
```

**Layout:**

```
┌────────────────────────────────────────────────────────────┐
│  Plugins                                   [Install Plugin] │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📦 Send Later                               [Enabled ▾]│ │
│  │    Schedule emails to be sent at a specific time        │ │
│  │    v1.0.0 • Open Mail Team                             │ │
│  │    Permissions: database, notifications                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📦 Thread Snooze                            [Enabled ▾]│ │
│  │    Snooze threads to reappear later                     │ │
│  │    v1.0.0 • Open Mail Team                             │ │
│  │    Permissions: database, notifications                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 📦 Grammar Check                          [Disabled ▾] │ │
│  │    Check grammar in your emails                         │ │
│  │    v0.1.0 • Community                                   │ │
│  │    Permissions: network ⚠️                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Lista de plugins instalados
- Enable/disable toggle
- Exibir permissions com warning para permissions sensiveis (network, filesystem)
- Instalar plugin a partir de arquivo (primeiro corte via `plugin.json`; zip/folder depois)
- Desinstalar plugin
- Ver config do plugin (se tem config schema, gerar UI)

**Criterio de aceite:**
- [x] Lista plugins instalados
- [x] Enable/disable funciona
- [x] Permissions exibidas
- [x] Instalar plugin de arquivo
- [x] Desinstalar plugin
- [x] Config UI auto-gerada a partir do schema

---

### 8.6 — Hooks System

**Status atual:** terceiro corte entregue, agora cobrindo frontend e quase todo o caminho observacional do backend. No frontend, o `pluginManager` executa hooks em ordem deterministica por `plugin_id`, isola falhas sem derrubar os demais plugins e suporta `transform hooks` sequenciais via `compose:transform-body`; a shell despacha `compose:before-send` e `compose:transform-body` nos fluxos reais de `queue` e `send later`. No backend, o `PluginHost` agora recebe dispatch observacional em `on_draft_created`, `on_message_sending`, `on_message_sent`, `on_message_received`, `on_thread_changed`, `on_account_added` e `on_sync_completed`, com cobertura de integracao nos comandos de draft/send/account e acesso basico ao payload via `openmail.get_payload_len()`. O que continua aberto nessa frente e a transformacao real de payload no backend, alem de ampliar a cobertura automatizada do fio vindo do sync para `on_message_received` e `on_thread_changed`.

**O que implementar:**

Hooks permitem plugins reagirem a eventos do sistema:

**Backend hooks:**

| Hook                      | Trigger                         | Data                    | Pode modificar? |
|---------------------------|---------------------------------|-------------------------|-----------------|
| `on_message_received`     | Novo email sincronizado         | `Message`               | Nao             |
| `on_message_sending`      | Antes de enviar email           | `DraftData`             | Sim (transform) |
| `on_message_sent`         | Apos enviar email               | `Message`               | Nao             |
| `on_draft_created`        | Novo draft criado               | `DraftData`             | Sim (transform) |
| `on_thread_changed`       | Thread modificado               | `Thread`                | Nao             |
| `on_account_added`        | Nova conta adicionada           | `Account`               | Nao             |
| `on_sync_completed`       | Ciclo de sync completado        | `SyncResult`            | Nao             |

**Frontend hooks:**

| Hook                      | Trigger                         | Data                    |
|---------------------------|---------------------------------|-------------------------|
| `compose:before-send`     | Antes de enviar (validacao)     | `DraftData`             |
| `compose:transform-body`  | Transform do body antes de send | `string (HTML)`         |
| `message:before-render`   | Antes de renderizar mensagem    | `Message`               |

**Criterio de aceite:**
- [x] Backend hooks despachados corretamente
- [x] Frontend hooks despachados corretamente
- [x] Transform hooks podem modificar dados
- [x] Plugins isolados (falha em um nao afeta outros)
- [x] Ordem de execucao deterministica

---

## Dependencias Adicionais

**Backend:**
```toml
wasmtime = "19"
```

**Frontend:**
```bash
npm install @openmail/plugin-sdk  # (pacote local inicialmente)
```

---

## Testes desta Fase

| Tipo        | Escopo                                          | Ferramenta   |
|-------------|------------------------------------------------|--------------|
| Unit        | Manifest parsing e validacao                    | `cargo test` |
| Unit        | Permission checker                              | `cargo test` |
| Unit        | WASM instance creation e sandbox                | `cargo test` |
| Unit        | Slot registration e retrieval                   | Vitest       |
| Unit        | Hook dispatch (order, error handling)           | `cargo test` |
| Integracao  | Plugin completo (manifest → load → activate → hook) | `cargo test` |
| Integracao  | Frontend plugin (dynamic import → slot render)  | Vitest + RTL |
| E2E         | Instalar plugin → habilitar → ver na UI         | Playwright   |

---

## Checklist Final da Fase 8

- [x] Plugin manifest schema definido e documentado
- [x] Plugin Host (Rust) com WASM runtime
- [x] Permission system funcional
- [x] Plugin Manager (Frontend) com dynamic import
- [ ] Slot system funcional (14+ slots definidos)
- [ ] Hook system funcional (backend + frontend)
- [x] Command system funcional
- [ ] Plugin SDK (frontend + backend)
- [ ] Template de plugin
- [x] Plugin Management UI em Preferences
- [x] Install/uninstall/enable/disable
- [x] Config UI auto-gerada
- [ ] Error isolation (crash de plugin nao afeta app)
- [ ] Plugin de exemplo funcional
- [ ] Documentacao para desenvolvedores
- [ ] Testes passando
- [ ] CI green

---

**Fase anterior:** [Fase 7 — Features Avancadas](./fase_7.md)
**Proxima fase:** [Fase 9 — Polish, Performance & Release](./fase_9.md)
