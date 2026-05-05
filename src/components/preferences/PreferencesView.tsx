import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { RuleEditor } from '@components/rules/RuleEditor';
import { RuleList } from '@components/rules/RuleList';
import { TemplateEditor } from '@components/templates/TemplateEditor';
import { TemplateList } from '@components/templates/TemplateList';
import { builtInThemes, type ThemeId } from '@lib/themes';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import { useAccountStore } from '@stores/useAccountStore';
import { useMailRulesStore } from '@stores/useMailRulesStore';
import { hydratePreferencesStore, savePreferencesToBackend } from '@stores/usePreferencesStore';
import { useShortcutStore } from '@stores/useShortcutStore';
import { usePreferencesStore } from '@stores/usePreferencesStore';
import { useSignatureStore } from '@stores/useSignatureStore';
import { useTemplateStore } from '@stores/useTemplateStore';
import { useUIStore } from '@stores/useUIStore';

const sections = [
  { id: 'general', title: 'General' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'appearance', title: 'Appearance' },
  { id: 'signatures', title: 'Signatures' },
  { id: 'shortcuts', title: 'Shortcuts' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'advanced', title: 'Advanced' }
] as const;

const themeOptions: ThemeId[] = ['system', 'dark', 'light'];

const prettifyShortcutAction = (value: string) =>
  value
    .split('.')
    .at(-1)
    ?.replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (character) => character.toUpperCase()) ?? value;

export const PreferencesView = () => {
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const hasHydratedRef = useRef(false);
  const launchAtLoginHydratedRef = useRef(false);
  const accounts = useAccountStore((state) => state.accounts);
  const selectedAccountId = useAccountStore((state) => state.selectedAccountId);
  const selectAccount = useAccountStore((state) => state.selectAccount);
  const removeAccount = useAccountStore((state) => state.removeAccount);
  const signatures = useSignatureStore((state) => state.signatures);
  const defaultSignatureId = useSignatureStore((state) => state.defaultSignatureId);
  const defaultSignatureIdsByAccountId = useSignatureStore((state) => state.defaultSignatureIdsByAccountId);
  const templates = useTemplateStore((state) => state.templates);
  const createTemplate = useTemplateStore((state) => state.create);
  const updateTemplate = useTemplateStore((state) => state.update);
  const deleteTemplate = useTemplateStore((state) => state.delete);
  const rules = useMailRulesStore((state) => state.rules);
  const createRule = useMailRulesStore((state) => state.create);
  const updateRule = useMailRulesStore((state) => state.update);
  const deleteRule = useMailRulesStore((state) => state.delete);
  const shortcutBindings = useShortcutStore((state) => state.bindings);
  const resetShortcutBindings = useShortcutStore((state) => state.resetShortcutBindings);
  const layoutMode = useUIStore((state) => state.layoutMode);
  const setLayoutMode = useUIStore((state) => state.setLayoutMode);
  const themeId = useUIStore((state) => state.themeId);
  const setThemeId = useUIStore((state) => state.setThemeId);
  const threadPanelWidth = useUIStore((state) => state.threadPanelWidth);
  const setThreadPanelWidth = useUIStore((state) => state.setThreadPanelWidth);
  const {
    language,
    defaultAccountId,
    markAsReadOnOpen,
    showSnippets,
    autoLoadImages,
    includeSignatureInReplies,
    requestReadReceipts,
    undoSendDelaySeconds,
    launchAtLogin,
    checkForUpdates,
    minimizeToTray,
    fontSize,
    density,
    notificationsEnabled,
    notificationSound,
    notificationScope,
    quietHoursStart,
    quietHoursEnd,
    developerToolsEnabled,
    logLevel,
    resetPreferences,
    setPreference
  } = usePreferencesStore();

  const availableAccounts = useMemo(
    () =>
      accounts.length
        ? accounts
        : [
            {
              id: 'acc_demo',
              provider: 'Gmail' as const,
              email: 'leco@example.com',
              displayName: 'Open Mail Demo'
            }
          ],
    [accounts]
  );

  const defaultAccountValue = defaultAccountId ?? selectedAccountId ?? availableAccounts[0]?.id ?? '';
  const signaturesByAccount = useMemo(
    () =>
      availableAccounts.map((account) => ({
        account,
        signatureTitle:
          signatures.find((signature) => signature.id === (defaultSignatureIdsByAccountId[account.id] ?? defaultSignatureId))
            ?.title ??
          signatures.find((signature) => signature.accountId === account.id)?.title ??
          signatures.find((signature) => signature.accountId === null)?.title ??
          'No signature'
      })),
    [availableAccounts, defaultSignatureId, defaultSignatureIdsByAccountId, signatures]
  );
  const editingTemplate = templates.find((template) => template.id === editingTemplateId) ?? null;
  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;

  const updateDefaultAccount = (accountId: string) => {
    setPreference('defaultAccountId', accountId);
    selectAccount(accountId);
  };

  const handleRemoveAccount = async (accountId: string) => {
    const account = availableAccounts.find((candidate) => candidate.id === accountId);
    if (!account) {
      return;
    }

    if (!window.confirm(`Remove ${account.displayName} from Open Mail?`)) {
      return;
    }

    if (tauriRuntime.isAvailable()) {
      setBackendStatus('saving');
      setBackendMessage(null);

      try {
        await api.accounts.remove(accountId);
      } catch (error) {
        setBackendStatus('error');
        setBackendMessage(error instanceof Error ? error.message : 'Failed to remove account');
        return;
      }
    }

    removeAccount(accountId);
    if (defaultAccountId === accountId) {
      setPreference('defaultAccountId', null);
    }

    setBackendStatus(tauriRuntime.isAvailable() ? 'saved' : 'idle');
    if (tauriRuntime.isAvailable()) {
      window.setTimeout(() => setBackendStatus((current) => (current === 'saved' ? 'idle' : current)), 1200);
    }
  };

  useEffect(() => {
    if (!tauriRuntime.isAvailable()) {
      hasHydratedRef.current = true;
      return;
    }

    let isActive = true;
    setBackendStatus('loading');
    setBackendMessage(null);

    void hydratePreferencesStore()
      .then(() => {
        if (!isActive) {
          return;
        }

        return api.system.getLaunchAtLogin().then((isEnabled) => {
          if (!isActive) {
            return;
          }

          launchAtLoginHydratedRef.current = true;
          if (usePreferencesStore.getState().launchAtLogin !== isEnabled) {
            setPreference('launchAtLogin', isEnabled);
          }
        });
      })
      .then(() => {
        if (!isActive) {
          return;
        }

        hasHydratedRef.current = true;
        setBackendStatus('idle');
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        hasHydratedRef.current = true;
        setBackendStatus('error');
        setBackendMessage(error instanceof Error ? error.message : 'Failed to load preferences');
      });

    return () => {
      isActive = false;
    };
  }, [setPreference]);

  useEffect(() => {
    if (!tauriRuntime.isAvailable() || !launchAtLoginHydratedRef.current || !hasHydratedRef.current) {
      return;
    }

    void api.system.setLaunchAtLogin(launchAtLogin).catch((error: unknown) => {
      setBackendStatus('error');
      setBackendMessage(error instanceof Error ? error.message : 'Failed to update launch at login');
    });
  }, [launchAtLogin]);

  useEffect(() => {
    if (!tauriRuntime.isAvailable() || !hasHydratedRef.current) {
      return;
    }

    setBackendStatus('saving');
    setBackendMessage(null);
    const timeoutId = window.setTimeout(() => {
      void savePreferencesToBackend()
        .then(() => {
          setBackendStatus('saved');
          window.setTimeout(() => setBackendStatus((current) => (current === 'saved' ? 'idle' : current)), 1200);
        })
        .catch((error: unknown) => {
          setBackendStatus('error');
          setBackendMessage(error instanceof Error ? error.message : 'Failed to save preferences');
        });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [
    autoLoadImages,
    checkForUpdates,
    defaultAccountId,
    density,
    developerToolsEnabled,
    fontSize,
    includeSignatureInReplies,
    language,
    launchAtLogin,
    layoutMode,
    logLevel,
    markAsReadOnOpen,
    minimizeToTray,
    notificationScope,
    notificationSound,
    notificationsEnabled,
    quietHoursEnd,
    quietHoursStart,
    requestReadReceipts,
    showSnippets,
    themeId,
    threadPanelWidth,
    undoSendDelaySeconds
  ]);

  return (
    <main className="preferences-shell" aria-label="Open Mail preferences">
      <div className="preferences-header">
        <div>
          <p className="eyebrow">Phase 6</p>
          <h1>Preferences</h1>
          <p>Adjust the app in one place. Theme and layout changes apply immediately, and desktop settings now sync through the Tauri backend automatically.</p>
          {tauriRuntime.isAvailable() ? (
            <p className="preferences-note">
              {backendStatus === 'loading' ? 'Loading desktop preferences…' : null}
              {backendStatus === 'saving' ? 'Saving desktop preferences…' : null}
              {backendStatus === 'saved' ? 'Desktop preferences saved.' : null}
              {backendStatus === 'error' ? backendMessage ?? 'Desktop preferences failed to sync.' : null}
            </p>
          ) : null}
        </div>
        <button className="preferences-close" onClick={() => navigate('/')} type="button">
          Close
        </button>
      </div>

      <div className="preferences-layout">
        <nav className="preferences-nav" aria-label="Preferences sections">
          {sections.map((section) => (
            <a className="preferences-nav-link" href={`#${section.id}`} key={section.id}>
              {section.title}
            </a>
          ))}
        </nav>

        <div className="preferences-content">
          <section className="preferences-section" id="general">
            <h2>General</h2>
            <div className="preferences-grid">
              <label className="preferences-field">
                <span>Language</span>
                <select value={language} onChange={(event) => setPreference('language', event.target.value)}>
                  <option>English</option>
                  <option>Portuguese</option>
                </select>
              </label>
              <label className="preferences-field">
                <span>Default account</span>
                <select value={defaultAccountValue} onChange={(event) => updateDefaultAccount(event.target.value)}>
                  {availableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName} &lt;{account.email}&gt;
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="preferences-toggle-list">
              <label><input checked={markAsReadOnOpen} onChange={(event) => setPreference('markAsReadOnOpen', event.target.checked)} type="checkbox" />Mark as read when opened</label>
              <label><input checked={showSnippets} onChange={(event) => setPreference('showSnippets', event.target.checked)} type="checkbox" />Show snippets in thread list</label>
              <label><input checked={autoLoadImages} onChange={(event) => setPreference('autoLoadImages', event.target.checked)} type="checkbox" />Auto-load remote images</label>
              <label><input checked={includeSignatureInReplies} onChange={(event) => setPreference('includeSignatureInReplies', event.target.checked)} type="checkbox" />Include signature in replies</label>
              <label><input checked={requestReadReceipts} onChange={(event) => setPreference('requestReadReceipts', event.target.checked)} type="checkbox" />Request read receipts</label>
              <label><input checked={launchAtLogin} onChange={(event) => setPreference('launchAtLogin', event.target.checked)} type="checkbox" />Launch at login</label>
              <label><input checked={checkForUpdates} onChange={(event) => setPreference('checkForUpdates', event.target.checked)} type="checkbox" />Check for updates</label>
              <label><input checked={minimizeToTray} onChange={(event) => setPreference('minimizeToTray', event.target.checked)} type="checkbox" />Close window to tray</label>
            </div>
            <label className="preferences-field">
              <span>Undo send delay</span>
              <select
                value={undoSendDelaySeconds}
                onChange={(event) => setPreference('undoSendDelaySeconds', Number(event.target.value))}
              >
                {[0, 5, 10, 15].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="preferences-section" id="accounts">
            <h2>Accounts</h2>
            <div className="preferences-account-list">
              {availableAccounts.map((account) => (
                <article className="preferences-account-card" key={account.id}>
                  <div>
                    <strong>{account.displayName}</strong>
                    <p>{account.email}</p>
                    <span>{account.provider}</span>
                  </div>
                  <div className="preferences-account-actions">
                    <button onClick={() => updateDefaultAccount(account.id)} type="button">
                      Make default
                    </button>
                    <button onClick={() => navigate('/onboarding/add-account')} type="button">
                      Re-auth / edit
                    </button>
                    {accounts.some((candidate) => candidate.id === account.id) ? (
                      <button onClick={() => handleRemoveAccount(account.id)} type="button">
                        Remove
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <button className="preferences-primary-button" onClick={() => navigate('/onboarding/add-account')} type="button">
              Add account
            </button>
          </section>

          <section className="preferences-section" id="appearance">
            <h2>Appearance</h2>
            <div className="preferences-theme-grid">
              {themeOptions.map((option) => (
                <button
                  className={themeId === option ? 'preferences-theme-card preferences-theme-card-active' : 'preferences-theme-card'}
                  key={option}
                  onClick={() => setThemeId(option)}
                  type="button"
                >
                  <strong>{option === 'system' ? 'System' : builtInThemes[option].name}</strong>
                  <span>{option === 'system' ? 'Follow the OS preference.' : builtInThemes[option].description}</span>
                </button>
              ))}
            </div>
            <div className="preferences-grid">
              <label className="preferences-field">
                <span>Layout</span>
                <select value={layoutMode} onChange={(event) => setLayoutMode(event.target.value as 'split' | 'list')}>
                  <option value="split">Split</option>
                  <option value="list">List</option>
                </select>
              </label>
              <label className="preferences-field">
                <span>Density</span>
                <select value={density} onChange={(event) => setPreference('density', event.target.value as 'comfortable' | 'compact')}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label className="preferences-field">
                <span>Font size</span>
                <input max="20" min="14" type="range" value={fontSize} onChange={(event) => setPreference('fontSize', Number(event.target.value))} />
              </label>
              <label className="preferences-field">
                <span>Thread panel width</span>
                <input max="72" min="38" type="range" value={threadPanelWidth} onChange={(event) => setThreadPanelWidth(Number(event.target.value))} />
              </label>
            </div>
          </section>

          <section className="preferences-section" id="signatures">
            <h2>Signatures</h2>
            <div className="preferences-signature-list">
              {signaturesByAccount.map(({ account, signatureTitle }) => (
                <article className="preferences-signature-card" key={account.id}>
                  <strong>{account.displayName}</strong>
                  <p>Default signature: {signatureTitle}</p>
                </article>
              ))}
              <article className="preferences-signature-card">
                <strong>Shared signatures</strong>
                <p>{signatures.length} signature(s) available in the composer workflow.</p>
              </article>
            </div>
            <div className="preferences-subsection">
              <div>
                <h3>Templates</h3>
                <p className="preferences-note">Reusable composer snippets with optional variables and account-specific scope.</p>
              </div>
              <TemplateEditor
                accounts={availableAccounts}
                editingTemplate={editingTemplate}
                onCancel={() => setEditingTemplateId(null)}
                onSave={(template) => {
                  if (editingTemplate) {
                    updateTemplate(editingTemplate.id, template);
                    setEditingTemplateId(null);
                    return;
                  }

                  createTemplate(template);
                }}
              />
              <TemplateList
                accounts={availableAccounts}
                onDelete={(templateId) => {
                  deleteTemplate(templateId);
                  if (editingTemplateId === templateId) {
                    setEditingTemplateId(null);
                  }
                }}
                onEdit={setEditingTemplateId}
                templates={templates}
              />
            </div>
          </section>

          <section className="preferences-section" id="shortcuts">
            <h2>Shortcuts</h2>
            <div className="preferences-shortcuts-table" role="table" aria-label="Shortcut bindings">
              {Object.entries(shortcutBindings).map(([action, binding]) => (
                <div className="preferences-shortcut-row" key={action} role="row">
                  <span role="cell">{prettifyShortcutAction(action)}</span>
                  <code role="cell">{binding}</code>
                </div>
              ))}
            </div>
            <button onClick={resetShortcutBindings} type="button">
              Reset to defaults
            </button>
            <p className="preferences-note">Custom editing stays in the shell for now; this section already reflects the current persisted bindings.</p>
          </section>

          <section className="preferences-section" id="notifications">
            <h2>Notifications</h2>
            <div className="preferences-toggle-list">
              <label><input checked={notificationsEnabled} onChange={(event) => setPreference('notificationsEnabled', event.target.checked)} type="checkbox" />Enable desktop notifications</label>
              <label><input checked={notificationSound} onChange={(event) => setPreference('notificationSound', event.target.checked)} type="checkbox" />Play sound</label>
            </div>
            <div className="preferences-grid">
              <label className="preferences-field">
                <span>Notify for</span>
                <select value={notificationScope} onChange={(event) => setPreference('notificationScope', event.target.value as 'inbox' | 'all')}>
                  <option value="inbox">Inbox only</option>
                  <option value="all">All folders</option>
                </select>
              </label>
              <label className="preferences-field">
                <span>Quiet hours start</span>
                <input type="time" value={quietHoursStart} onChange={(event) => setPreference('quietHoursStart', event.target.value)} />
              </label>
              <label className="preferences-field">
                <span>Quiet hours end</span>
                <input type="time" value={quietHoursEnd} onChange={(event) => setPreference('quietHoursEnd', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="preferences-section" id="advanced">
            <h2>Advanced</h2>
            <div className="preferences-grid">
              <label className="preferences-field">
                <span>Log level</span>
                <select value={logLevel} onChange={(event) => setPreference('logLevel', event.target.value as 'info' | 'debug' | 'trace')}>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                  <option value="trace">Trace</option>
                </select>
              </label>
              <label className="preferences-field">
                <span>Database path</span>
                <input disabled type="text" value="open-mail-dev.sqlite" />
              </label>
            </div>
            <div className="preferences-toggle-list">
              <label><input checked={developerToolsEnabled} onChange={(event) => setPreference('developerToolsEnabled', event.target.checked)} type="checkbox" />Enable developer tools</label>
            </div>
            <div className="preferences-subsection">
              <div>
                <h3>Mail Rules</h3>
                <p className="preferences-note">This first cut ships the local rule builder and the matching engine. Desktop auto-processing and Run now stay open for the next cut.</p>
              </div>
              <RuleEditor
                accounts={availableAccounts}
                editingRule={editingRule}
                onCancel={() => setEditingRuleId(null)}
                onSave={(rule) => {
                  if (editingRule) {
                    updateRule(editingRule.id, rule);
                    setEditingRuleId(null);
                    return;
                  }

                  createRule(rule);
                }}
              />
              <RuleList
                accounts={availableAccounts}
                onDelete={(ruleId) => {
                  deleteRule(ruleId);
                  if (editingRuleId === ruleId) {
                    setEditingRuleId(null);
                  }
                }}
                onEdit={setEditingRuleId}
                rules={rules}
              />
            </div>
            <div className="preferences-advanced-actions">
              <button onClick={resetPreferences} type="button">Reset local preferences</button>
              <button disabled type="button">Clear cache</button>
              <button disabled type="button">Export data</button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
