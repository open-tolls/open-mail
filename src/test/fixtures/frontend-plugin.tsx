/* eslint-disable react-refresh/only-export-components */

import type { FrontendPluginContext } from '@/plugins/types';

const StatusLeft = () => <span>Plugin left ready</span>;

const StatusRight = ({ activeFolderName }: { activeFolderName?: string }) => (
  <span>Plugin right {activeFolderName ?? 'none'}</span>
);

const PreferencesSection = ({ config }: { config?: Record<string, unknown> }) => (
  <section className="preferences-section" aria-label="Plugin preferences section">
    <h2>Plugin section</h2>
    <p>{String(config?.themeId ?? 'unknown theme')}</p>
  </section>
);

const BrokenStatus = () => {
  throw new Error('plugin slot render failed');
};

export default {
  activate: ({ getConfig, registerCommand, registerHook }: FrontendPluginContext) => {
    registerCommand('ping', async (args: unknown) => ({
      args,
      pluginMessage: getConfig('plugin_message')
    }));
    registerHook('status:collect', async (payload: unknown) => ({
      payload,
      pluginMessage: getConfig('plugin_message')
    }));
  },
  components: {
    BrokenStatus,
    PreferencesSection,
    StatusLeft,
    StatusRight
  }
};
