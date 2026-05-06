import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { pluginManager } from '@/plugins/plugin-manager';
import type { FrontendPluginManifest } from '@/plugins/types';
import { useAccountStore } from '@stores/useAccountStore';
import { useMailRulesStore } from '@stores/useMailRulesStore';
import { usePreferencesStore } from '@stores/usePreferencesStore';
import { useTemplateStore } from '@stores/useTemplateStore';
import { useUIStore } from '@stores/useUIStore';

const tauriCoreApi = vi.hoisted(() => ({
  convertFileSrc: vi.fn((value: string) => value),
  invoke: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: tauriCoreApi.convertFileSrc,
  invoke: tauriCoreApi.invoke
}));

const setTauriRuntime = (isAvailable: boolean) => {
  if (isAvailable) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        invoke: tauriCoreApi.invoke
      }
    });
    return;
  }

  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
};

const preferencesPluginManifest: FrontendPluginManifest = {
  config: {
    fields: {
      plugin_message: {
        default: 'Inbox pulse',
        type: 'text'
      }
    }
  },
  frontend: {
    entry: '/src/test/fixtures/frontend-plugin.tsx',
    slots: [{ component: 'PreferencesSection', name: 'preferences:section' }]
  },
  plugin: {
    id: 'com.openmail.plugin.preferences-fixture',
    name: 'Preferences Fixture',
    version: '1.0.0'
  }
};

describe('preferences view', () => {
  beforeEach(() => {
    setTauriRuntime(false);
    tauriCoreApi.invoke.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
    pluginManager.reset();
  });

  it('renders all seven preference sections on the dedicated route', async () => {
    window.history.pushState({}, '', '/preferences');
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc_demo',
          provider: 'Gmail',
          email: 'leco@example.com',
          displayName: 'Open Mail Demo'
        }
      ],
      selectedAccountId: 'acc_demo'
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Signatures' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contacts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeInTheDocument();
  });

  it('renders plugin preference sections through the plugin slot', async () => {
    window.history.pushState({}, '', '/preferences');
    await pluginManager.loadPlugin(preferencesPluginManifest);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Plugin section' })).toBeInTheDocument();
  });

  it('applies theme and layout changes immediately from preferences', async () => {
    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /parchment/i }));
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'list' } });
    expect(useUIStore.getState().layoutMode).toBe('list');
  });

  it('hydrates and saves preferences through the desktop backend', async () => {
    setTauriRuntime(true);
    tauriCoreApi.invoke.mockImplementation(async (command, args) => {
      if (command === 'get_config') {
        return {
          language: 'Portuguese',
          defaultAccountId: 'acc_demo',
          markAsReadOnOpen: false,
          showSnippets: false,
          autoLoadImages: true,
          includeSignatureInReplies: false,
          requestReadReceipts: true,
          undoSendDelaySeconds: 10,
          launchAtLogin: false,
          checkForUpdates: false,
          minimizeToTray: true,
          theme: 'light',
          fontSize: 18,
          layoutMode: 'list',
          density: 'compact',
          threadPanelWidth: 64,
          notificationsEnabled: false,
          notificationSound: false,
          notificationScope: 'all',
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          developerToolsEnabled: true,
          logLevel: 'debug'
        };
      }

      if (command === 'update_config') {
        return args?.config;
      }

      throw new Error(`unexpected command ${command}`);
    });

    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByLabelText('Language')).toHaveValue('Portuguese'));
    expect(useUIStore.getState().themeId).toBe('light');
    expect(useUIStore.getState().layoutMode).toBe('list');

    fireEvent.click(screen.getByLabelText('Check for updates'));

    await waitFor(() => {
      const updateCall = tauriCoreApi.invoke.mock.calls.find(([command]) => command === 'update_config');
      expect(updateCall).toBeDefined();
      expect(updateCall?.[1]).toEqual(
        expect.objectContaining({
          config: expect.objectContaining({
            language: 'Portuguese',
            checkForUpdates: true,
            minimizeToTray: true,
            theme: 'light',
            layoutMode: 'list'
          })
        })
      );
    });

    expect(usePreferencesStore.getState().checkForUpdates).toBe(true);
  });

  it('syncs the launch at login toggle with the desktop autostart plugin', async () => {
    setTauriRuntime(true);
    window.history.pushState({}, '', '/preferences');

    let autostartEnabled = true;
    tauriCoreApi.invoke.mockImplementation(async (command) => {
      if (command === 'get_config') {
        return {
          language: 'English',
          defaultAccountId: 'acc_demo',
          markAsReadOnOpen: true,
          showSnippets: true,
          autoLoadImages: false,
          includeSignatureInReplies: true,
          requestReadReceipts: false,
          undoSendDelaySeconds: 5,
          launchAtLogin: false,
          checkForUpdates: true,
          minimizeToTray: false,
          theme: 'system',
          fontSize: 16,
          layoutMode: 'split',
          density: 'comfortable',
          threadPanelWidth: 58,
          notificationsEnabled: true,
          notificationSound: true,
          notificationScope: 'inbox',
          quietHoursStart: '',
          quietHoursEnd: '',
          developerToolsEnabled: false,
          logLevel: 'info'
        };
      }

      if (command === 'update_config') {
        return undefined;
      }

      if (command === 'plugin:autostart|is_enabled') {
        return autostartEnabled;
      }

      if (command === 'plugin:autostart|enable') {
        autostartEnabled = true;
        return undefined;
      }

      if (command === 'plugin:autostart|disable') {
        autostartEnabled = false;
        return undefined;
      }

      throw new Error(`unexpected command ${command}`);
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByLabelText('Launch at login')).toBeChecked());

    fireEvent.click(screen.getByLabelText('Launch at login'));

    await waitFor(() =>
      expect(tauriCoreApi.invoke).toHaveBeenCalledWith('plugin:autostart|disable', {}, undefined)
    );
    expect(usePreferencesStore.getState().launchAtLogin).toBe(false);
  });

  it('removes an account through the desktop backend after confirmation', async () => {
    setTauriRuntime(true);
    tauriCoreApi.invoke.mockImplementation(async (command) => {
      if (command === 'get_config') {
        return {
          language: 'English',
          defaultAccountId: 'acc_demo',
          markAsReadOnOpen: true,
          showSnippets: true,
          autoLoadImages: false,
          includeSignatureInReplies: true,
          requestReadReceipts: false,
          undoSendDelaySeconds: 5,
          launchAtLogin: true,
          checkForUpdates: true,
          minimizeToTray: false,
          theme: 'system',
          fontSize: 16,
          layoutMode: 'split',
          density: 'comfortable',
          threadPanelWidth: 58,
          notificationsEnabled: true,
          notificationSound: true,
          notificationScope: 'inbox',
          quietHoursStart: '',
          quietHoursEnd: '',
          developerToolsEnabled: false,
          logLevel: 'info'
        };
      }

      if (command === 'remove_account' || command === 'update_config') {
        return undefined;
      }

      throw new Error(`unexpected command ${command}`);
    });
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc_demo',
          provider: 'Gmail',
          email: 'leco@example.com',
          displayName: 'Open Mail Demo'
        },
        {
          id: 'acc_ops',
          provider: 'Outlook',
          email: 'ops@example.com',
          displayName: 'Operations'
        }
      ],
      selectedAccountId: 'acc_demo'
    });

    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const accountsSection = await screen.findByRole('heading', { name: 'Accounts' });
    const accountCard = within(accountsSection.closest('section') ?? document.body).getByText('Operations').closest('article');
    expect(accountCard).not.toBeNull();

    fireEvent.click(within(accountCard as HTMLElement).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      const removeCall = tauriCoreApi.invoke.mock.calls.find(([command]) => command === 'remove_account');
      expect(removeCall).toEqual(['remove_account', { accountId: 'acc_ops' }, undefined]);
    });

    expect(useAccountStore.getState().accounts).toHaveLength(1);
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
  });

  it('manages templates from preferences', async () => {
    window.history.pushState({}, '', '/preferences');
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc_demo',
          provider: 'Gmail',
          email: 'leco@example.com',
          displayName: 'Open Mail Demo'
        }
      ],
      selectedAccountId: 'acc_demo'
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Welcome template' } });
    fireEvent.change(screen.getByLabelText('Body (HTML)'), {
      target: { value: '<p>Hello {{name}},</p><p>Welcome aboard.</p>' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    expect(screen.getByText('Welcome template')).toBeInTheDocument();
    expect(useTemplateStore.getState().templates[0]?.variables).toEqual(['name']);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Welcome {{name}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    expect(screen.getByText('Welcome {{name}}')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Welcome template')).not.toBeInTheDocument();
  });

  it('manages mail rules from preferences', async () => {
    window.history.pushState({}, '', '/preferences');
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc_demo',
          provider: 'Gmail',
          email: 'leco@example.com',
          displayName: 'Open Mail Demo'
        }
      ],
      selectedAccountId: 'acc_demo'
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Newsletter rule' } });
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'newsletter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));

    expect(screen.getByText('Newsletter rule')).toBeInTheDocument();
    expect(useMailRulesStore.getState().rules[0]?.name).toBe('Newsletter rule');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated rule' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rule' }));

    expect(screen.getByText('Updated rule')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Updated rule')).not.toBeInTheDocument();
  });

  it('runs mail rules against loaded threads', async () => {
    window.history.pushState({}, '', '/preferences');
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc_demo',
          provider: 'Gmail',
          email: 'leco@example.com',
          displayName: 'Open Mail Demo'
        }
      ],
      selectedAccountId: 'acc_demo'
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Mail Rules')).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Newsletter archive' } });
    fireEvent.change(screen.getByDisplayValue('From'), { target: { value: 'subject' } });
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'premium' } });
    fireEvent.change(screen.getAllByDisplayValue('Archive')[0], { target: { value: 'star' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));

    expect(await screen.findByText('Run now matched 1 thread')).toBeInTheDocument();
  });

  it('lists and filters auto-populated contacts in preferences', async () => {
    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const contactsList = await screen.findByLabelText('Contacts list');
    expect(within(contactsList).getByText('Atlas Design')).toBeInTheDocument();
    expect(screen.getByText('Recent thread history')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search contacts'), { target: { value: 'release' } });

    expect(await within(contactsList).findByText('Release Ops')).toBeInTheDocument();
    expect(within(contactsList).queryByText('Atlas Design')).not.toBeInTheDocument();
  });

  it('edits and resets custom contact info in preferences', async () => {
    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const contactsList = await screen.findByLabelText('Contacts list');
    expect(within(contactsList).getByText('Atlas Design')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Contact display name'), { target: { value: 'Atlas VIP' } });
    fireEvent.change(screen.getByLabelText('Contact notes'), { target: { value: 'Priority creative partner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save contact info' }));

    expect(await within(contactsList).findByText('Atlas VIP')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact notes')).toHaveValue('Priority creative partner');
    expect(screen.getAllByText('Priority creative partner').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reset custom info' }));

    expect(await within(contactsList).findByText('Atlas Design')).toBeInTheDocument();
    expect(screen.queryByText('Priority creative partner')).not.toBeInTheDocument();
  });
});
