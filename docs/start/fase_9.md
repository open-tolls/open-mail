# Fase 9 — Polish, Performance & Release

**Duracao estimada:** 3 semanas
**Dependencia:** Fases 0-8 concluidas
**Objetivo:** Polir a aplicacao para producao — otimizar performance, garantir acessibilidade, estabilizar, configurar distribuicao multiplataforma e preparar o primeiro release publico.

---

## Contexto

Esta fase nao adiciona features novas. Ela transforma um software funcional em um produto confiavel, rapido e pronto para usuarios reais. Cada item aqui e a diferenca entre "funciona no meu computador" e "funciona para 100.000 usuarios".

---

## Entregaveis

### 9.1 — Performance Optimization

#### 9.1.1 — Backend (Rust)

**Database:**
- [ ] Analisar queries lentas com `EXPLAIN QUERY PLAN`
- [ ] Adicionar indices faltantes baseado em queries reais
- [ ] Implementar connection pooling (r2d2 ou deadpool)
- [ ] Configurar `PRAGMA` otimos:
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -64000;  -- 64MB
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA temp_store = MEMORY;
  ```
- [ ] Vacuum periodico (weekly background task)
- [ ] Limitar tamanho do banco (configuravel, padrao: 2GB)

**Sync Engine:**
- [ ] Batch IMAP fetches (chunks de 100 UIDs)
- [ ] Compressao IMAP (COMPRESS=DEFLATE extension)
- [ ] Connection reuse (manter conexao IMAP viva)
- [ ] Priorizar inbox sobre outros folders
- [ ] Limitar depth de sync historico (configuravel, padrao: 3 meses)
- [ ] Cache de headers no disco (evitar re-fetch)

**Memory:**
- [ ] Profile memory com `heaptrack` ou `valgrind`
- [ ] Limitar cache em memoria (LRU com tamanho maximo)
- [ ] Liberar bodies de mensagens fora da viewport
- [ ] Streaming de attachments grandes (nao carregar tudo em memoria)

**Metricas alvo:**
| Metrica                          | Alvo                |
|----------------------------------|---------------------|
| Cold start (ate janela visivel)  | < 1.5s              |
| RAM idle (1 conta, 10k msgs)    | < 80MB              |
| RAM idle (3 contas, 50k msgs)   | < 150MB             |
| CPU idle                         | < 1% (zero wakes)   |
| Scroll 10k threads (60fps)      | 0 dropped frames    |
| Search em 100k msgs              | < 500ms             |
| Sync incremental (check new)     | < 2s                |
| Send email                       | < 3s                |

---

#### 9.1.2 — Frontend (React)

**Rendering:**
- [ ] React Profiler — identificar re-renders desnecessarios
- [ ] `React.memo` em componentes puros (ThreadListItem, MessageCollapsed)
- [ ] Zustand selectors granulares (evitar re-render de store inteiro)
- [ ] `useMemo` / `useCallback` onde necessario (nao prematuro)
- [ ] Lazy loading de routes (React.lazy + Suspense)
- [ ] Code splitting por rota (Vite dynamic import)

**Virtualizacao:**
- [ ] Thread list: confirmar que virtualiza corretamente com 50k+ items
- [ ] Message list: virtualizar se thread tem muitas mensagens (>50)
- [ ] Attachment previews: lazy load (IntersectionObserver)

**Assets:**
- [ ] Fontes: preload + font-display: swap
- [ ] Icones: tree-shake Lucide (import individual, nao wildcard)
- [ ] CSS: purge de TailwindCSS em producao (automatico com v4)
- [ ] Bundle size: analisar com `vite-bundle-visualizer`
- [ ] Target bundle size: < 500KB gzipped (JS + CSS)

**Metricas alvo:**
| Metrica                          | Alvo                |
|----------------------------------|---------------------|
| First Contentful Paint           | < 500ms             |
| Time to Interactive              | < 1s                |
| Bundle size (JS gzipped)        | < 400KB             |
| Bundle size (CSS gzipped)       | < 50KB              |

---

### 9.2 — Accessibility (a11y)

**Status atual:** oitavo corte entregue em navegacao, foco, preferencias visuais do sistema e copy acessivel para screen reader. Alem de `skip links`, landmarks/focus targets, `focus-visible`, `prefers-reduced-motion`, `prefers-contrast`, thread announcements, `aria-live` nos toasts, regiao acessivel no reader, `focus management` nos dialogs e navegacao por setas na thread list, o reader agora tambem permite navegar entre mensagens com `ArrowUp`, `ArrowDown`, `Home` e `End`, e o shell recebeu um reforco nos tokens de contraste/legibilidade para melhorar leitura de bordas, superficies e texto secundario. Isso ainda nao fecha a fase de a11y, mas deixa o fluxo keyboard-only e a leitura visual mais consistentes entre inbox e leitura.

**O que implementar:**

- [ ] Todos os elementos interativos com `role` e `aria-label`
- [x] Focus management (Tab order logico)
- [x] Focus visible (outline) em todos os focusaveis
- [x] Screen reader: thread list anuncia "Email from Alice, subject: Project update, 2 hours ago, unread"
- [x] Screen reader: message body legivel
- [x] High contrast mode (respeitar `prefers-contrast: high`)
- [x] Reduced motion (respeitar `prefers-reduced-motion`)
- [ ] Keyboard-only navigation em toda a app
- [x] Skip links ("Skip to inbox", "Skip to message")
- [ ] Color contrast minimo 4.5:1 (WCAG AA)
- [ ] Font sizing: respeitar preferencia do OS
- [x] Error messages acessiveis (aria-live regions)

**Ferramentas de teste:**
- `axe-core` via Playwright
- Manual testing com VoiceOver (macOS)
- Lighthouse accessibility audit

**Criterio de aceite:**
- [ ] Lighthouse accessibility score >= 95
- [ ] Zero violations criticas no axe-core
- [ ] Toda a app navegavel por teclado
- [ ] VoiceOver funcional para fluxos principais

---

### 9.3 — Internationalization (i18n)

**Referencia Mailspring:** `app/lang/` (109 arquivos de traducao), `app/src/intl.ts`

**O que implementar:**

```typescript
// src/lib/i18n.ts
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

i18next
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: enTranslations },
      pt: { translation: ptTranslations },
      // ...
    },
    interpolation: { escapeValue: false },
  });
```

**Idiomas iniciais:**
1. English (en) — padrao
2. Portugues Brasileiro (pt-BR)
3. Espanhol (es)

**Strings a traduzir:**
- UI labels (botoes, menus, tooltips)
- Mensagens de erro
- Formatacao de datas (relativo: "2 hours ago" → "2 horas atras")
- Plurais ("1 message" / "5 messages")

**Criterio de aceite:**
- [ ] 3 idiomas funcionais
- [ ] Troca de idioma sem restart
- [ ] Datas formatadas no locale correto
- [ ] Plurais corretos
- [ ] Nenhuma string hardcoded no codigo

---

### 9.4 — Error Handling & Recovery

**Status atual:** segundo corte entregue na camada frontend. Alem de `AppErrorBoundary` global no roteamento e `SectionErrorBoundary` aplicado nas regioes mais sensiveis do shell (`sidebar`, `composer`, `thread list` e `message reader`), o app agora tambem expõe um `offline mode` visual quando o navegador/runtime perde conexao, com banner persistente e status degradado no topbar. Os proximos cortes dessa frente continuam em retry de rede, fila explicita de operacoes offline e recuperacao backend.

**O que implementar:**

**Backend:**
- [ ] Panic handler global (log + restart graceful)
- [ ] Sync engine: retry com backoff em falhas transientes
- [ ] Database: WAL checkpoint periodico
- [ ] Database: backup automatico (semanal)
- [ ] Crash report (opt-in, anonimizado)

**Frontend:**
- [x] Error boundary global (tela de erro amigavel)
- [x] Error boundary por secao (sidebar, thread list, message view, composer)
- [ ] Toast de erro para falhas de operacao
- [ ] Retry automatico para falhas de rede (Tauri invoke)
- [ ] Offline mode: indicador visual + queue de operacoes

**Offline behavior:**
```
┌────────────────────────────────────────┐
│  ⚠️ You're offline                      │
│  Changes will sync when reconnected    │
└────────────────────────────────────────┘
```

- Leitura funciona normalmente (dados locais)
- Escrita enfileirada (mark read, star, archive)
- Compose e save draft funcionam (envio ao reconectar)
- Sync retomado automaticamente ao reconectar

**Criterio de aceite:**
- [ ] App nao crasha com erros de rede
- [ ] Offline mode funcional (leitura + queue de writes)
- [ ] Error boundaries previnem tela branca
- [ ] Database backup automatico
- [ ] Crash report opt-in

---

### 9.5 — Auto-Update

**O que implementar:**

```rust
// Usando tauri-plugin-updater
use tauri_plugin_updater::UpdaterExt;

fn setup_updater(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match handle.updater().check().await {
                Ok(Some(update)) => {
                    // Notificar usuario
                    handle.emit("update:available", &update.version).ok();
                }
                _ => {}
            }
            tokio::time::sleep(Duration::from_secs(3600)).await; // check hourly
        }
    });
    Ok(())
}
```

**Frontend UI:**

```
┌────────────────────────────────────────────────┐
│  🆕 Update available: v1.1.0                    │
│  [Release Notes]  [Later]  [Update & Restart]   │
└────────────────────────────────────────────────┘
```

**Tauri updater config:**
```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.openmail.app/{{target}}/{{arch}}/{{current_version}}"],
      "pubkey": "..."
    }
  }
}
```

**Criterio de aceite:**
- [ ] Check for updates automatico (hourly)
- [ ] Notificacao de update disponivel
- [ ] Download + install + restart
- [ ] Assinatura de update verificada (seguranca)
- [ ] Opt-out em Preferences

---

### 9.6 — Packaging & Distribution

**O que implementar:**

**macOS:**
- [ ] `.dmg` installer com background image
- [ ] Code signing com Apple Developer ID
- [ ] Notarization com Apple
- [ ] Universal binary (Intel + Apple Silicon)
- [ ] Homebrew cask formula

**Linux:**
- [ ] `.deb` package (Debian/Ubuntu)
- [ ] `.rpm` package (Fedora/RHEL)
- [ ] `.AppImage` (universal)
- [ ] Flatpak (futuro)
- [ ] Snap (futuro)

**Windows:**
- [ ] `.msi` installer (WiX)
- [ ] `.exe` NSIS installer
- [ ] Winget manifest
- [ ] Code signing com EV certificate

**Tauri config para bundling:**
```json
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "deb", "rpm", "appimage", "msi", "nsis"],
    "identifier": "com.openmail.app",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.15",
      "signingIdentity": "...",
      "providerShortName": "..."
    },
    "windows": {
      "certificateThumbprint": "...",
      "digestAlgorithm": "sha256"
    }
  }
}
```

**CI/CD para releases (GitHub Actions):**

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: windows-latest
            target: x86_64-pc-windows-msvc
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      - run: npm ci
      - run: cargo tauri build --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: binaries-${{ matrix.target }}
          path: src-tauri/target/${{ matrix.target }}/release/bundle/

  publish:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: softprops/action-gh-release@v1
        with:
          files: binaries-*/**/*
          generate_release_notes: true
```

**Criterio de aceite:**
- [ ] Binarios gerados para macOS (arm64 + x86_64), Linux (x86_64), Windows (x86_64)
- [ ] Installers funcionais em todas as plataformas
- [ ] Code signing (macOS + Windows)
- [ ] Auto-update funcional
- [ ] CI/CD de release automatizado

---

### 9.7 — Observability & Telemetry

**O que implementar:**

**Logging estruturado (Rust):**
```rust
use tracing::{info, warn, error, instrument};
use tracing_subscriber::{fmt, EnvFilter};

#[instrument(skip(db))]
pub async fn sync_folder(db: &Database, folder: &Folder) -> Result<(), SyncError> {
    info!(folder_id = %folder.id, folder_name = %folder.name, "Starting folder sync");
    // ...
    info!(new_messages = count, "Folder sync completed");
}
```

**Log rotation:**
- Logs em `~/.local/share/open-mail/logs/`
- Rotacao diaria, manter 7 dias
- Nivel configuravel (error, warn, info, debug, trace)

**Crash reporting (opt-in):**
- Capturar panics e erros fatais
- Anonimizar dados (sem emails, sem nomes)
- Enviar para endpoint proprio (nao third-party)

**Health check endpoint (interno):**
```rust
#[tauri::command]
pub async fn health_check(state: State<'_, AppState>) -> Result<HealthStatus, ()> {
    Ok(HealthStatus {
        database: state.db.is_healthy(),
        sync_accounts: state.sync_manager.status(),
        memory_mb: get_memory_usage_mb(),
        uptime_seconds: get_uptime(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
```

**Criterio de aceite:**
- [ ] Logging estruturado em todo o backend
- [ ] Log rotation funcional
- [ ] Crash reporting opt-in
- [ ] Health check acessivel pelo frontend (para diagnostico)
- [ ] Developer tools toggle (Preferences > Advanced)

---

### 9.8 — Documentation & README

**O que implementar:**

**README.md:**
- Descricao do projeto
- Screenshots
- Features
- Download links
- Build from source instructions
- Contributing guide link

**CONTRIBUTING.md:**
- Setup de desenvolvimento
- Arquitetura overview
- Como rodar testes
- Como criar plugins
- Code style guide
- PR process

**docs/:**
```
docs/
├── architecture.md         # Visao geral da arquitetura
├── plugin-development.md   # Guia para desenvolvedores de plugins
├── keyboard-shortcuts.md   # Lista completa de atalhos
├── faq.md                  # Perguntas frequentes
└── adr/                    # Architecture Decision Records
    ├── 001-tauri-over-electron.md
    ├── 002-rust-sync-engine.md
    ├── 003-zustand-over-reflux.md
    ├── 004-tiptap-over-slate.md
    ├── 005-wasm-plugin-sandbox.md
    └── 006-tailwind-over-less.md
```

**Criterio de aceite:**
- [ ] README com screenshots e download links
- [ ] CONTRIBUTING com setup completo
- [ ] ADRs para todas as decisoes arquiteturais
- [ ] Plugin development guide

---

### 9.9 — Final QA & Release Checklist

**Testing final:**
- [ ] Smoke test manual em macOS (Intel + Apple Silicon)
- [ ] Smoke test manual em Ubuntu 22.04
- [ ] Smoke test manual em Windows 11
- [ ] E2E suite completa passando
- [ ] Performance benchmarks dentro dos alvos
- [ ] Accessibility audit (Lighthouse >= 95)
- [ ] Security audit (dependencias, CSP, sanitizacao)

**Release checklist:**
- [ ] Version bump (Cargo.toml + package.json)
- [ ] CHANGELOG.md atualizado
- [ ] Tag git criada (v1.0.0)
- [ ] CI/CD build green em todas as plataformas
- [ ] Binarios assinados (macOS + Windows)
- [ ] macOS notarization completa
- [ ] Auto-update endpoint configurado
- [ ] Release notes redigidas
- [ ] Download page atualizada
- [ ] Anuncio preparado

---

## Testes desta Fase

| Tipo        | Escopo                                          | Ferramenta      |
|-------------|------------------------------------------------|-----------------|
| Performance | Cold start time                                 | Custom benchmark|
| Performance | Memory profiling                                | heaptrack       |
| Performance | Scroll performance (60fps)                      | Chrome DevTools |
| Performance | Search latency                                  | Custom benchmark|
| Performance | Bundle size analysis                            | vite-bundle-vis |
| a11y        | Automated accessibility scan                    | axe-core        |
| a11y        | Screen reader testing                           | VoiceOver       |
| a11y        | Keyboard navigation                             | Manual          |
| E2E         | Full user journey (onboard → compose → send)    | Playwright      |
| E2E         | Cross-platform smoke tests                      | CI matrix       |
| Security    | Dependency audit                                | `cargo audit`   |
| Security    | CSP validation                                  | Manual          |
| Security    | HTML sanitization edge cases                    | Vitest          |

---

## Checklist Final da Fase 9

- [ ] Performance otimizada (backend + frontend)
- [ ] RAM < 80MB idle, CPU < 1% idle
- [ ] Cold start < 1.5s
- [ ] Accessibility WCAG AA compliant
- [ ] 3 idiomas (en, pt-BR, es)
- [ ] Error handling robusto + offline mode
- [ ] Auto-update funcional
- [ ] Packaging para macOS, Linux, Windows
- [ ] Code signing (macOS + Windows)
- [ ] CI/CD de release automatizado
- [ ] Logging estruturado + crash reporting
- [ ] Documentacao completa
- [ ] QA final passando em todas as plataformas
- [ ] v1.0.0 released 🎉

---

**Fase anterior:** [Fase 8 — Plugin System v2](./fase_8.md)

---

## Pos-Release (Roadmap Futuro)

Apos o v1.0.0, features planejadas para releases futuros:

| Feature                    | Release Alvo | Descricao                                    |
|----------------------------|--------------|----------------------------------------------|
| JMAP support               | v1.1         | Protocolo moderno alternativo ao IMAP        |
| Calendar (full)            | v1.2         | Calendario integrado com ICS                 |
| Plugin marketplace         | v1.3         | Loja de plugins com install one-click        |
| PGP/S-MIME encryption      | v1.4         | Criptografia end-to-end de emails            |
| Unified search             | v1.5         | Busca cross-account em todas as mensagens    |
| Mobile companion           | v2.0         | App mobile (Tauri Mobile ou nativo)          |
| AI features                | v2.1         | Smart compose, summarize, categorize (local) |
| Exchange ActiveSync        | v2.2         | Suporte nativo a Exchange (sem IMAP bridge)  |
