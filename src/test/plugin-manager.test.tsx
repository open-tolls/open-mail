import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailStatusBar } from '@components/layout/MailStatusBar';
import { PluginSlot } from '@/plugins/PluginSlot';
import { pluginManager } from '@/plugins/plugin-manager';
import type { FrontendPluginManifest } from '@/plugins/types';

const manifest: FrontendPluginManifest = {
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

    await expect(
      pluginManager.executeCommand('com.openmail.plugin.frontend-fixture:ping', { draftId: 'dr_1' })
    ).resolves.toEqual({
      args: { draftId: 'dr_1' },
      pluginMessage: 'Inbox pulse'
    });

    await expect(pluginManager.runHooks('status:collect', { unreadCount: 2 })).resolves.toEqual([
      {
        payload: { unreadCount: 2 },
        pluginMessage: 'Inbox pulse'
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
        enabled: false,
        manifest: expect.objectContaining({
          plugin: expect.objectContaining({
            id: 'com.openmail.plugin.frontend-fixture'
          })
        })
      })
    ]);

    await pluginManager.enablePlugin(manifest.plugin.id);

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
  });
});
