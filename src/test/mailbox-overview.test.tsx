import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { pluginManager } from '@/plugins/plugin-manager';
import type { FrontendPluginManifest } from '@/plugins/types';
import { useAccountStore } from '@stores/useAccountStore';
import { useMailRulesStore } from '@stores/useMailRulesStore';
import { useSendReminderStore } from '@stores/useSendReminderStore';
import { useShortcutStore } from '@stores/useShortcutStore';
import { useSignatureStore } from '@stores/useSignatureStore';

const composeHookManifest: FrontendPluginManifest = {
  config: {
    fields: {
      append_html: {
        default: '<p>Plugin appended footer</p>',
        label: 'append_html',
        type: 'text'
      },
      block_message: {
        default: 'Composer blocked by plugin policy',
        label: 'block_message',
        type: 'text'
      },
      block_send: {
        default: false,
        label: 'block_send',
        type: 'boolean'
      },
      plugin_label: {
        default: 'compose-hook',
        label: 'plugin_label',
        type: 'text'
      }
    }
  },
  frontend: {
    entry: '/src/test/fixtures/frontend-compose-hooks-plugin.tsx',
    slots: []
  },
  plugin: {
    id: 'com.openmail.plugin.compose-hook-fixture',
    name: 'Compose hook fixture',
    version: '1.0.0'
  }
};

describe('mailbox overview integration', () => {
  beforeEach(() => {
    const print = vi.fn();
    const focus = vi.fn();
    const close = vi.fn();
    const document = {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn()
    };

    vi.spyOn(window, 'open').mockImplementation(() =>
      ({
        print,
        focus,
        close,
        document
      }) as unknown as Window
    );
    pluginManager.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders mailbox data in the shell', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /inbox/i })).toBeInTheDocument();
    expect(await screen.findByText('motion-notes.pdf')).toBeInTheDocument();
    expect((await screen.findAllByText('design-review')).length).toBeGreaterThan(0);
    expect(await screen.findByText('System folders')).toBeInTheDocument();
    expect(await screen.findByText('Custom folders')).toBeInTheDocument();
    expect(await screen.findByText('Labels')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Label design-review' })).toBeInTheDocument();
    expect(await screen.findByText('Accounts')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('2 unread');
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Inbox');

    const folderNav = await screen.findByLabelText('Mailbox folders');
    fireEvent.click(within(folderNav).getByRole('button', { name: /starred/i }));
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
    expect(screen.queryByText('motion-notes.pdf')).not.toBeInTheDocument();
    expect((await screen.findAllByText('tauri-health')).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Starred');

    fireEvent.click(await screen.findByRole('button', { name: /sent/i }));
    expect(await screen.findByRole('heading', { name: 'Ship notes for desktop alpha' })).toBeInTheDocument();
    expect(await screen.findByText('release@example.com')).toBeInTheDocument();
    expect((await screen.findAllByText('desktop-alpha')).length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/sent');

    fireEvent.click(within(folderNav).getByRole('button', { name: /archive/i }));
    expect(await screen.findByText('Archive is clear')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/archive');
  });

  it('filters threads through the shell search input', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const searchInput = await screen.findByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'rust' } });

    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
    expect(await screen.findByText('Search results for "rust"')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Premium motion system approved' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'no-match-term' } });
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('filters fallback threads with structured search syntax', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const searchInput = await screen.findByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'from:infra subject:health is:starred' } });

    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
    expect(await screen.findByText('Search results for "from:infra subject:health is:starred"')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Premium motion system approved' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'has:attachment from:release' } });
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('suggests structured search filters from mailbox context', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const searchInput = await screen.findByRole('textbox');
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: 'from:inf' } });

    fireEvent.click(await screen.findByRole('option', { name: 'from:infra@example.com Messages from infra@example.com' }));

    expect(searchInput).toHaveValue('from:infra@example.com');
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
  });

  it('supports phase 3 keyboard shortcuts for search, composer, and thread navigation', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const searchInput = await screen.findByRole('textbox');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(searchInput).toHaveFocus();
    expect(await screen.findByRole('listbox', { name: 'Search suggestions' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(await screen.findByLabelText(/^to$/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText(/^to$/i)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'j' });
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k' });
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
  });

  it('auto-processes new inbox threads with enabled mail rules', async () => {
    useMailRulesStore.setState({
      rules: [
        {
          id: 'rule_archive_premium',
          accountId: 'acc_demo',
          name: 'Archive premium approvals',
          enabled: true,
          mode: 'all',
          conditions: [
            {
              id: 'condition_subject',
              field: 'subject',
              operator: 'contains',
              value: 'premium'
            }
          ],
          actions: [
            {
              id: 'action_archive',
              type: 'archive',
              value: ''
            }
          ]
        }
      ]
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const threadList = await screen.findByRole('listbox', { name: 'Thread list' });

    expect(await within(threadList).findByText('Rust health-check online')).toBeInTheDocument();
    expect(within(threadList).queryByText('Premium motion system approved')).not.toBeInTheDocument();
  });

  it('shows a From selector in the composer when multiple accounts are available', async () => {
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

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));

    const fromSelect = await screen.findByRole('combobox', { name: 'From' });
    expect(fromSelect).toHaveValue('acc_demo');

    fireEvent.change(fromSelect, { target: { value: 'acc_ops' } });

    expect(fromSelect).toHaveValue('acc_ops');
    expect(screen.getByRole('option', { name: 'Operations <ops@example.com>' })).toBeInTheDocument();
  });

  it('switches to the default signature of the selected account for a new draft', async () => {
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
    useSignatureStore.setState({
      signatures: [
        {
          id: 'sig_default',
          title: 'Default signature',
          body: '<p>Best,<br />Leco</p>',
          accountId: null
        },
        {
          id: 'sig_ops',
          title: 'Operations signature',
          body: '<p>Thanks,<br />Operations</p>',
          accountId: 'acc_ops'
        }
      ],
      defaultSignatureId: 'sig_default',
      defaultSignatureIdsByAccountId: {
        acc_ops: 'sig_ops'
      }
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));

    const fromSelect = await screen.findByRole('combobox', { name: 'From' });
    const message = screen.getByRole('textbox', { name: 'Message' });

    expect(message).toHaveTextContent('Best,');
    expect(message).toHaveTextContent('Leco');

    fireEvent.change(fromSelect, { target: { value: 'acc_ops' } });

    await waitFor(() => {
      expect(message).toHaveTextContent('Thanks,');
      expect(message).toHaveTextContent('Operations');
    });
    expect(message).not.toHaveTextContent('Best,');
  });

  it('opens add account from the sidebar and shows the new account in the shell list', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Add account' }));

    expect(await screen.findByRole('heading', { name: 'Add your email account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Other IMAP/i }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Operations' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('IMAP server'), { target: { value: 'imap.example.com' } });
    fireEvent.change(screen.getByLabelText('SMTP server'), { target: { value: 'smtp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Run checks' }));
    await screen.findAllByText('Ready');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to sync' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run initial sync' }));
    expect(useAccountStore.getState().accounts.some((account) => account.email === 'ops@example.com')).toBe(true);

    act(() => {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    const configuredAccounts = await screen.findByLabelText('Configured accounts');
    expect(within(configuredAccounts).getByText('Operations')).toBeInTheDocument();
    expect(within(configuredAccounts).getByText('ops@example.com')).toBeInTheDocument();
  });

  it('shows a unified inbox when multiple accounts are configured', async () => {
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

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('button', { name: /unified inbox/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Operations rollout ready' })).toBeInTheDocument();

    const threadList = await screen.findByRole('listbox', { name: 'Thread list' });
    expect(within(threadList).getByText('Operations rollout ready')).toBeInTheDocument();
    expect(within(threadList).getByText('Premium motion system approved')).toBeInTheDocument();
  });

  it('shows independent sync status per account in the sidebar', async () => {
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

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const configuredAccounts = await screen.findByLabelText('Configured accounts');
    expect(await within(configuredAccounts).findByText('Sync syncing folders')).toBeInTheDocument();
    expect(await within(configuredAccounts).findByText('Sync idling')).toBeInTheDocument();
  });

  it('supports phase 3 thread action shortcuts with status feedback', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 's' });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Star shortcut applied: Premium motion system approved'
    );

    fireEvent.keyDown(window, { key: '#' });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Trash shortcut applied: Premium motion system approved'
    );

    fireEvent.keyDown(window, { key: 'r' });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Reply shortcut queued: Rust health-check online'
    );
  });

  it('shows undo toast for destructive thread actions and restores by button or shortcut', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '#' });
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
    const undoToast = await screen.findByRole('status', { name: 'Undo notification' });
    expect(undoToast).toHaveTextContent('Thread action applied');
    expect(undoToast).toHaveAttribute('aria-live', 'polite');
    expect(undoToast).toHaveAttribute('aria-atomic', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Undo last action' }));
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'e' });
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
  });

  it('auto-dismisses undo toast after five seconds', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    vi.useFakeTimers();

    try {
      fireEvent.keyDown(window, { key: 's' });
      expect(screen.getByRole('status', { name: 'Undo notification' })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole('status', { name: 'Undo notification' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens move and label thread dialogs from keyboard shortcuts', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'v' });
    expect(await screen.findByRole('dialog', { name: 'Move threads dialog' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'l' });
    expect(await screen.findByRole('dialog', { name: 'Label threads dialog' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Move threads dialog' })).not.toBeInTheDocument();
  });

  it('snoozes a thread from the shell and restores it from the Snoozed folder', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b' });
    expect(await screen.findByRole('dialog', { name: 'Snooze threads dialog' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Later today' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Snooze threads dialog' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Premium motion system approved' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();

    const folderNav = await screen.findByLabelText('Mailbox folders');
    fireEvent.click(within(folderNav).getByRole('button', { name: /snoozed/i }));

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('listbox', { name: 'Thread list' })).getByText('Premium motion system approved')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unsnooze selected threads' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Premium motion system approved' })).not.toBeInTheDocument();
    });

    fireEvent.click(within(folderNav).getByRole('button', { name: /inbox/i }));
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
  });

  it('persists custom phase 3 shortcut bindings', async () => {
    useShortcutStore.getState().setShortcutBinding('thread.star', 'x');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'x' });

    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Star shortcut applied: Premium motion system approved'
    );
    expect(window.localStorage.getItem('open-mail-shortcuts')).toContain('"thread.star":"x"');
  });

  it('supports phase 3 mailbox number shortcuts', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByRole('heading', { name: 'Ship notes for desktop alpha' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Sent');

    fireEvent.keyDown(window, { key: '3', metaKey: true });
    expect(await screen.findByText('Drafts is clear')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Drafts');

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Inbox');
  });

  it('hydrates mailbox selection from route params', async () => {
    window.history.pushState({}, '', '/sent/thr_3');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Ship notes for desktop alpha' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Sent');
  });

  it('pushes selected threads into the browser route', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByText('Rust health-check online'));

    expect(window.location.pathname).toBe('/inbox/thr_2');
  });

  it('persists phase 3 layout mode through the toolbar toggle', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const layoutToggle = await screen.findByRole('button', { name: /switch to list layout/i });
    fireEvent.click(layoutToggle);

    expect(await screen.findByRole('button', { name: /switch to split layout/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('List layout');
    expect(window.localStorage.getItem('open-mail-ui')).toContain('"layoutMode":"list"');
  });

  it('cycles and persists phase 3 themes through the toolbar toggle', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /switch theme \(system\)/i }));

    expect(await screen.findByRole('button', { name: /switch theme \(dark\)/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('open-mail-ui')).toContain('"themeId":"dark"');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('queues a composed message from the shell', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    const composer = await screen.findByRole('region', { name: /composer/i });
    expect(composer).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('Best,');
    fireEvent.click(screen.getByRole('button', { name: /add cc/i }));
    fireEvent.focus(screen.getByLabelText(/^to$/i));
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'atl' } });
    fireEvent.click(await screen.findByRole('option', { name: 'atlas@example.com' }));
    fireEvent.paste(screen.getByLabelText(/^cc$/i), {
      clipboardData: {
        getData: () => 'cc-review@example.com,\ncc-ops@example.com'
      }
    });
    fireEvent.change(screen.getByLabelText('Attach files'), {
      target: {
        files: [new File(['budget'], 'budget.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })]
      }
    });
    expect(await screen.findByText('budget.xlsx')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Review package' } });
    fireEvent.click(screen.getByRole('button', { name: /^queue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Queued 1 recipient(s)')).toBeInTheDocument();
    });
    const composerToast = screen.getByRole('status', { name: 'Composer notification' });
    expect(composerToast).toHaveTextContent('Queued 1 recipient(s)');
    expect(composerToast).toHaveAttribute('aria-live', 'polite');
    expect(composerToast).toHaveAttribute('aria-atomic', 'true');
  });

  it('lets compose hooks block queueing from the shell', async () => {
    await pluginManager.loadPlugin({
      ...composeHookManifest,
      plugin: {
        ...composeHookManifest.plugin,
        id: 'com.openmail.plugin.compose-blocker'
      },
      config: {
        fields: {
          ...composeHookManifest.config!.fields,
          block_send: {
            default: true,
            label: 'block_send',
            type: 'boolean'
          }
        }
      }
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Blocked by policy' } });
    fireEvent.click(screen.getByRole('button', { name: /^queue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Could not queue message: Composer blocked by plugin policy')).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /composer/i })).toBeInTheDocument();
    const composerErrorToast = screen.getByRole('alert', { name: 'Composer notification' });
    expect(composerErrorToast).toHaveAttribute('aria-live', 'assertive');
    expect(composerErrorToast).toHaveAttribute('aria-atomic', 'true');
  });

  it('queues a composed message with Cmd+Enter from the shell', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    const composer = await screen.findByRole('region', { name: /composer/i });
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Shortcut queue' } });

    fireEvent.keyDown(composer, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('Queued 1 recipient(s)')).toBeInTheDocument();
    });
  });

  it('moves a locally flushed composed message into the Sent folder', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Sent after flush' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'release@example.com' } });
    fireEvent.keyDown(screen.getByLabelText(/^to$/i), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /^queue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Queued 2 recipient(s)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Flush queue' }));

    await waitFor(() => {
      expect(screen.getByText('Sent 1/1; failed 0')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: '2', metaKey: true });

    expect(await screen.findByRole('heading', { name: 'Sent after flush' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Sent');
  });

  it('restores a scheduled message into the composer from Scheduled', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Scheduled follow-up' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'release@example.com' } });
    fireEvent.keyDown(screen.getByLabelText(/^to$/i), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Attach files'), {
      target: {
        files: [new File(['plan'], 'plan.pdf', { type: 'application/pdf' })]
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send later' }));
    fireEvent.change(screen.getByLabelText('Pick send later date and time'), {
      target: { value: '2026-05-04T09:01' }
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule custom time' }));
      await Promise.resolve();
    });

    expect(screen.getAllByText(/Scheduled for/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('status', { name: 'Composer notification' })).toHaveTextContent(/Scheduled for/i);

    fireEvent.click(screen.getByRole('button', { name: /scheduled/i }));
    expect(await screen.findByText('Scheduled follow-up')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Scheduled follow-up'));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /composer/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Scheduled follow-up');
    expect(screen.getByTitle('release@example.com')).toBeInTheDocument();
    expect(screen.getByText('plan.pdf')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Composer notification' })).toHaveTextContent('Scheduled draft restored');
    expect(screen.queryByText('Scheduled follow-up')).not.toBeInTheDocument();
  });

  it('applies compose transform hooks before scheduling a draft', async () => {
    await pluginManager.loadPlugin(composeHookManifest);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Hooked scheduled message' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'release@example.com' } });
    fireEvent.keyDown(screen.getByLabelText(/^to$/i), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Send later' }));
    fireEvent.change(screen.getByLabelText('Pick send later date and time'), {
      target: { value: '2026-05-04T09:01' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule custom time' }));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: /scheduled/i }));
    fireEvent.click(await screen.findByText('Hooked scheduled message'));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /composer/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('Plugin appended footer');
  });

  it('restores a locally autosaved draft when reopening the composer', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    const composer = await screen.findByRole('region', { name: /composer/i });
    expect(composer).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Autosaved subject' } });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByLabelText('Mailbox status')).toHaveTextContent('Draft saved locally');

    vi.useRealTimers();
    fireEvent.click(within(composer).getByRole('button', { name: /close composer/i }));
    expect(screen.queryByRole('region', { name: /composer/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new message/i }));
    expect(await screen.findByRole('region', { name: /composer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Autosaved subject');
  });

  it('lists locally autosaved drafts in the Drafts folder and reopens them from the thread list', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    const composer = await screen.findByRole('region', { name: /composer/i });

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Draft from folder' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'drafts@example.com' } });
    fireEvent.keyDown(screen.getByLabelText(/^to$/i), { key: 'Enter' });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    vi.useRealTimers();
    fireEvent.click(within(composer).getByRole('button', { name: /close composer/i }));

    fireEvent.keyDown(window, { key: '3', metaKey: true });

    expect(await screen.findByText('Draft from folder')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Drafts');
    expect(screen.getByRole('button', { name: /drafts/i })).toHaveTextContent('1');

    fireEvent.click(screen.getByText('Draft from folder'));

    expect(await screen.findByRole('region', { name: /composer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Draft from folder');
    expect(screen.getByTitle('drafts@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Mailbox status')).toHaveTextContent('Draft restored');
  });

  it('opens a reply draft with quoted content once the selected message is available', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
    expect((await screen.findAllByText('Vamos fechar a base visual do composer e da thread list hoje.')).length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: 'r' });

    const composer = await screen.findByRole('region', { name: /composer/i });
    expect(composer).toBeInTheDocument();
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Re: Premium motion system approved');
    expect(within(composer).getByTitle('atlas@example.com')).toBeInTheDocument();
    expect(within(composer).getByRole('button', { name: 'Show quoted text' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('On Mar 13, 2026');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent(
      'Vamos fechar a base visual do composer e da thread list hoje.'
    );

    fireEvent.click(within(composer).getByRole('button', { name: 'Show quoted text' }));
    expect(within(composer).getByRole('button', { name: 'Hide quoted text' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens a forward draft with forwarded content from the selected message', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Forward' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));

    const composer = await screen.findByRole('region', { name: /composer/i });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Forward draft ready');
    expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Fwd: Premium motion system approved');
    expect(within(composer).queryByTitle('atlas@example.com')).not.toBeInTheDocument();
    expect(within(composer).getByText('motion-notes.pdf')).toBeInTheDocument();
    expect(within(composer).getByRole('button', { name: 'Show quoted text' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('Forwarded message');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('From: Atlas Design');
  });

  it('opens a clean print dialog from the reader action and the keyboard shortcut', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));

    expect(window.open).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Print dialog opened');

    fireEvent.keyDown(window, { key: 'p', metaKey: true });

    expect(window.open).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Print dialog opened');
  });

  it('creates and lists active send reminders from the composer flow', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Follow-up candidate' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'atlas@example.com' } });
    fireEvent.keyDown(screen.getByLabelText(/^to$/i), { key: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }));
    fireEvent.click(screen.getByRole('button', { name: 'In 1 day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(await screen.findByRole('button', { name: /reminders/i })).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: /reminders/i }));
    expect((await screen.findAllByText('Follow-up candidate')).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Reminders');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel reminder' }));
    expect(await screen.findByRole('button', { name: /reminders/i })).toHaveTextContent('0');
  });

  it('moves a due follow-up reminder back into the inbox and shows feedback', async () => {
    useSendReminderStore.setState({
      reminders: [
        {
          id: 'rem_due',
          accountId: 'acc_demo',
          threadId: 'thr_3',
          subject: 'Ship notes for desktop alpha',
          recipients: ['release@example.com'],
          remindAt: '2026-03-13T06:00:00Z',
          createdAt: '2026-03-13T05:00:00Z',
          status: 'active'
        }
      ]
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Follow-up reminder due: Ship notes for desktop alpha').length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reminders/i })).toHaveTextContent('0');
    });

    fireEvent.click(screen.getByRole('button', { name: /inbox/i }));
    expect(await screen.findByText('Ship notes for desktop alpha')).toBeInTheDocument();
  });

  it('auto-cancels a follow-up reminder after the thread already has a reply', async () => {
    useSendReminderStore.setState({
      reminders: [
        {
          id: 'rem_replied',
          accountId: 'acc_demo',
          threadId: 'thr_1',
          subject: 'Premium motion system approved',
          recipients: ['atlas@example.com'],
          remindAt: '2026-06-20T09:00:00Z',
          createdAt: '2026-03-12T09:00:00Z',
          status: 'active'
        }
      ]
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reminders/i })).toHaveTextContent('0');
    });
    expect(await screen.findByRole('status', { name: 'Composer notification' })).toHaveTextContent(
      'Follow-up reminder auto-cancelled after reply'
    );
  });
});
