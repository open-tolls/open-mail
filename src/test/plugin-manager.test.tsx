import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailStatusBar } from '@components/layout/MailStatusBar';
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
      { component: 'PreferencesSection', name: 'preferences:section' }
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
});
