import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailSidebar } from '@components/layout/MailSidebar';
import { MailStatusBar } from '@components/layout/MailStatusBar';
import { MessageReaderPanel } from '@components/layout/MessageReaderPanel';
import { ThreadListPanel } from '@components/layout/ThreadListPanel';
import { parseFrontendPluginManifest } from '@/plugins/manifest';
import { PluginSlot } from '@/plugins/PluginSlot';
import { pluginManager } from '@/plugins/plugin-manager';
import type { FrontendPluginManifest } from '@/plugins/types';

const manifest: FrontendPluginManifest = {
  config: {
    fields: {
      enable_digest: {
        default: true,
        label: 'Enable digest',
        type: 'boolean'
      },
      morning_time: {
        default: '08:00',
        label: 'Morning time',
        type: 'time'
      },
      plugin_message: {
        label: 'Plugin message',
        default: 'Inbox pulse',
        type: 'text'
      },
      tone: {
        default: 'calm',
        label: 'Tone',
        options: ['calm', 'urgent'],
        type: 'select'
      }
    }
  },
  frontend: {
    entry: '/src/test/fixtures/frontend-plugin.tsx',
    slots: [
      { component: 'StatusLeft', name: 'status-bar:left' },
      { component: 'StatusRight', name: 'status-bar:right' },
      { component: 'BrokenStatus', name: 'status-bar:right' },
      { component: 'PreferencesSection', name: 'preferences:section' },
      { component: 'SidebarHeader', name: 'sidebar:header' },
      { component: 'SidebarFooter', name: 'sidebar:footer' },
      { component: 'SidebarHeader', name: 'sidebar:after-compose' },
      { component: 'SidebarFooter', name: 'sidebar:after-system-folders' },
      { component: 'ThreadListHeader', name: 'thread-list:header' },
      { component: 'ThreadListHeader', name: 'thread-list:footer' },
      { component: 'ThreadDialogFooter', name: 'thread-list:dialog-footer' },
      { component: 'ReaderFooter', name: 'reader:header' },
      { component: 'ReaderFooter', name: 'reader:footer' },
      { component: 'OnboardingHeader', name: 'onboarding:header' },
      { component: 'OnboardingHeader', name: 'onboarding:footer' }
    ]
  },
  permissions: {
    filesystem: true,
    notifications: true
  },
  plugin: {
    description: 'Fixture plugin for slot rendering tests',
    id: 'com.openmail.plugin.frontend-fixture',
    name: 'Frontend Fixture',
    version: '1.0.0'
  }
};

const createComposeHookManifest = (
  pluginId: string,
  configDefaults: Record<string, unknown>
): FrontendPluginManifest => ({
  config: {
    fields: Object.fromEntries(
      Object.entries(configDefaults).map(([key, value]) => [
        key,
        {
          default: value,
          label: key,
          type: typeof value === 'boolean' ? 'boolean' : 'text'
        }
      ])
    )
  },
  frontend: {
    entry: '/src/test/fixtures/frontend-compose-hooks-plugin.tsx',
    slots: []
  },
  plugin: {
    id: pluginId,
    name: pluginId,
    version: '1.0.0'
  }
});

const failingManifest: FrontendPluginManifest = {
  frontend: {
    entry: '/src/test/fixtures/frontend-failing-plugin.tsx',
    slots: []
  },
  plugin: {
    id: 'com.openmail.plugin.failing-fixture',
    name: 'Failing Fixture',
    version: '1.0.0'
  }
};

describe('plugin manager', () => {
  beforeEach(() => {
    pluginManager.reset();
    vi.restoreAllMocks();
  });

  it('loads a frontend plugin, renders slot components, and isolates crashing slot renders', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await pluginManager.loadPlugin(manifest);

    render(
      <MailStatusBar
        actionStatusLabel="Composer ready"
        activeFolderName="Inbox"
        layoutMode="split"
        syncStatusLabel="Frontend ready"
        totalUnreadCount={3}
      />
    );

    expect(screen.getByText('Plugin left ready')).toBeInTheDocument();
    expect(screen.getByText('Plugin right Inbox')).toBeInTheDocument();
    expect(screen.queryByText('plugin slot render failed')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('registers frontend commands and hooks with config access', async () => {
    await pluginManager.loadPlugin(manifest);

    pluginManager.updatePluginConfig(manifest.plugin.id, 'plugin_message', 'Updated pulse');

    await expect(
      pluginManager.executeCommand('com.openmail.plugin.frontend-fixture:ping', { draftId: 'dr_1' })
    ).resolves.toEqual({
      args: { draftId: 'dr_1' },
      pluginMessage: 'Updated pulse'
    });

    await expect(pluginManager.runHooks('status:collect', { unreadCount: 2 })).resolves.toEqual([
      {
        payload: { unreadCount: 2 },
        pluginMessage: 'Updated pulse'
      }
    ]);
  });

  it('updates plugin slots through subscriptions after dynamic import', async () => {
    render(<PluginSlot name="preferences:section" props={{ config: { themeId: 'parchment' } }} />);

    expect(screen.queryByRole('heading', { name: 'Plugin section' })).not.toBeInTheDocument();

    await act(async () => {
      await pluginManager.loadPlugin(manifest);
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Plugin section' })).toBeInTheDocument();
    });
    expect(screen.getByText('parchment')).toBeInTheDocument();
  });

  it('renders expanded shell slots across sidebar, thread list, and reader panels', async () => {
    await pluginManager.loadPlugin(manifest);

    render(
      <>
        <MailSidebar
          activeAccountId="acc_demo"
          activeFolderId="fld_inbox"
          accounts={[
            {
              id: 'acc_demo',
              provider: 'Gmail',
              email: 'team@example.com',
              displayName: 'Team Inbox'
            }
          ]}
          folders={[
            {
              id: 'fld_inbox',
              account_id: 'acc_demo',
              name: 'Inbox',
              path: 'Inbox',
              role: 'inbox',
              unread_count: 4,
              total_count: 20,
              created_at: '2026-05-07T10:00:00.000Z',
              updated_at: '2026-05-07T10:00:00.000Z'
            }
          ]}
          isCollapsed={false}
          isComposerOpen={false}
          isOutboxBusy={false}
          onAddAccount={() => undefined}
          onFlushOutbox={async () => undefined}
          onOpenPreferences={() => undefined}
          onSelectFolder={() => undefined}
          onToggleComposer={() => undefined}
          onToggleSidebar={() => undefined}
          outboxStatus="Queue ready"
          syncStatusByAccountId={{}}
        />
        <ThreadListPanel
          activeFolderId="fld_inbox"
          activeFolderName="Inbox"
          folders={[
            {
              id: 'fld_archive',
              account_id: 'acc_demo',
              name: 'Archive',
              path: 'Archive',
              role: 'archive',
              unread_count: 0,
              total_count: 10,
              created_at: '2026-05-07T10:00:00.000Z',
              updated_at: '2026-05-07T10:00:00.000Z'
            }
          ]}
          isSearchActive={false}
          onSelectThread={() => undefined}
          searchQuery=""
          selectedThreadId={null}
          threads={[
            {
              id: 'thr_1',
              subject: 'Plugin coverage',
              snippet: 'Testing slots',
              participants: ['team@example.com'],
              isUnread: true,
              isStarred: false,
              hasAttachments: false,
              messageCount: 1,
              lastMessageAt: '2026-05-07T10:00:00.000Z'
            }
          ]}
        />
        <MessageReaderPanel
          contacts={[]}
          isMessagesLoading={false}
          messages={[
            {
              id: 'msg_1',
              account_id: 'acc_demo',
              thread_id: 'thr_1',
              from: [],
              to: [],
              cc: [],
              bcc: [],
              reply_to: [],
              subject: 'Plugin coverage',
              snippet: 'Testing slots',
              body: '<p>Body</p>',
              plain_text: 'Body',
              message_id_header: '<msg_1@example.com>',
              in_reply_to: null,
              references: [],
              folder_id: 'fld_inbox',
              label_ids: [],
              is_unread: true,
              is_starred: false,
              is_draft: false,
              date: '2026-05-07T10:00:00.000Z',
              attachments: [],
              headers: {},
              created_at: '2026-05-07T10:00:00.000Z',
              updated_at: '2026-05-07T10:00:00.000Z'
            }
          ]}
          onDownloadAttachment={() => undefined}
          onForwardMessage={() => undefined}
          onOpenExternalLink={() => undefined}
          onPrintMessage={() => undefined}
          onReplyAllMessage={() => undefined}
          onReplyMessage={() => undefined}
          onSelectMessage={() => undefined}
          resolveInlineImageUrl={(path) => path}
          selectedMessageId="msg_1"
          selectedThread={{
            id: 'thr_1',
            subject: 'Plugin coverage',
            snippet: 'Testing slots',
            participants: ['team@example.com'],
            isUnread: true,
            isStarred: false,
            hasAttachments: false,
            messageCount: 1,
            lastMessageAt: '2026-05-07T10:00:00.000Z'
          }}
        />
      </>
    );

    expect(screen.getAllByText('Plugin sidebar header acc_demo')).toHaveLength(2);
    expect(screen.getAllByText('Plugin sidebar footer fld_inbox')).toHaveLength(2);
    expect(screen.getAllByText('Plugin thread header 1')).toHaveLength(2);
    expect(screen.getAllByText('Plugin reader footer 1')).toHaveLength(2);
  });

  it('keeps plugin manifests registered when disabling and can enable them again', async () => {
    await pluginManager.loadPlugin(manifest);

    expect(pluginManager.listPlugins()).toEqual([
      expect.objectContaining({
        enabled: true,
        manifest: expect.objectContaining({
          plugin: expect.objectContaining({
            id: 'com.openmail.plugin.frontend-fixture'
          })
        })
      })
    ]);

    await pluginManager.unloadPlugin(manifest.plugin.id);

    expect(pluginManager.listPlugins()).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          enable_digest: true,
          morning_time: '08:00',
          plugin_message: 'Inbox pulse',
          tone: 'calm'
        }),
        enabled: false,
        manifest: expect.objectContaining({
          plugin: expect.objectContaining({
            id: 'com.openmail.plugin.frontend-fixture'
          })
        })
      })
    ]);

    pluginManager.updatePluginConfig(manifest.plugin.id, 'plugin_message', 'Persisted across reload');
    await pluginManager.enablePlugin(manifest.plugin.id);

    expect(pluginManager.listPlugins()).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          plugin_message: 'Persisted across reload'
        }),
        enabled: true,
        manifest: expect.objectContaining({
          plugin: expect.objectContaining({
            id: 'com.openmail.plugin.frontend-fixture'
          })
        })
      })
    ]);

    await expect(
      pluginManager.executeCommand('com.openmail.plugin.frontend-fixture:ping', { draftId: 'dr_2' })
    ).resolves.toEqual({
      args: { draftId: 'dr_2' },
      pluginMessage: 'Persisted across reload'
    });
  });

  it('fully removes an uninstalled plugin from the registry', async () => {
    await pluginManager.installPlugin(manifest);

    expect(pluginManager.listPlugins()).toHaveLength(1);

    await pluginManager.uninstallPlugin(manifest.plugin.id);

    expect(pluginManager.listPlugins()).toEqual([]);
    expect(pluginManager.getPluginConfig(manifest.plugin.id)).toEqual({});
  });

  it('runs compose hooks in plugin id order and isolates plugin failures', async () => {
    await pluginManager.loadPlugin(
      createComposeHookManifest('com.openmail.plugin.compose-b', {
        append_html: '<p>B</p>',
        plugin_label: 'B',
        throw_on_transform: true,
        throw_on_before_send: true
      })
    );
    await pluginManager.loadPlugin(
      createComposeHookManifest('com.openmail.plugin.compose-c', {
        append_html: '<p>C</p>',
        plugin_label: 'C'
      })
    );
    await pluginManager.loadPlugin(
      createComposeHookManifest('com.openmail.plugin.compose-a', {
        append_html: '<p>A</p>',
        plugin_label: 'A'
      })
    );

    await expect(pluginManager.runTransformHooks('compose:transform-body', '<p>Hello</p>')).resolves.toBe(
      '<p>Hello</p><p>A</p><p>C</p>'
    );

    await expect(pluginManager.runHooks('compose:before-send', { htmlBody: '<p>Hello</p>' })).resolves.toEqual([
      {
        allow: true,
        htmlBody: '<p>Hello</p>',
        pluginLabel: 'A'
      },
      {
        allow: true,
        htmlBody: '<p>Hello</p>',
        pluginLabel: 'C'
      }
    ]);
  });

  it('keeps a plugin registered in error state when activation fails', async () => {
    await expect(pluginManager.installPlugin(failingManifest)).rejects.toThrow('Plugin activation failed');

    expect(pluginManager.listPlugins()).toEqual([
      expect.objectContaining({
        enabled: false,
        errorMessage: 'Plugin activation failed',
        manifest: expect.objectContaining({
          plugin: expect.objectContaining({
            id: 'com.openmail.plugin.failing-fixture'
          })
        }),
        state: 'error'
      })
    ]);
  });

  it('loads the inbox insights example plugin from the repository example bundle', async () => {
    const manifest = parseFrontendPluginManifest(
      JSON.stringify({
        plugin: {
          id: 'com.openmail.plugin.inbox-insights',
          name: 'Inbox Insights',
          version: '1.0.0',
          description: 'Adds a lightweight unread summary to the status bar and Preferences.'
        },
        permissions: {
          notifications: true
        },
        config: {
          fields: {
            label: {
              type: 'text',
              label: 'Status label',
              default: 'Focus'
            },
            showUnreadBadge: {
              type: 'boolean',
              label: 'Show unread badge',
              default: true
            }
          }
        },
        frontend: {
          entry: '/plugins/examples/inbox-insights/ui/index.tsx',
          slots: [
            { name: 'status-bar:right', component: 'InboxInsightsBadge' },
            { name: 'preferences:section', component: 'InboxInsightsPreferences' }
          ]
        }
      })
    );

    await pluginManager.installPlugin(manifest);

    render(
      <MailStatusBar
        actionStatusLabel="Composer ready"
        activeFolderName="Inbox"
        layoutMode="split"
        syncStatusLabel="Frontend ready"
        totalUnreadCount={5}
      />
    );

    expect(screen.getByText('5 unread tracked')).toBeInTheDocument();
  });
});
