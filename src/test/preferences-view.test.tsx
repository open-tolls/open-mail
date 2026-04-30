import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { useAccountStore } from '@stores/useAccountStore';
import { usePreferencesStore } from '@stores/usePreferencesStore';
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

describe('preferences view', () => {
  beforeEach(() => {
    setTauriRuntime(false);
    tauriCoreApi.invoke.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
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
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeInTheDocument();
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
});
