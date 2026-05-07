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

const SidebarHeader = ({ activeAccountId }: { activeAccountId?: string }) => (
  <p>Plugin sidebar header {activeAccountId ?? 'no-account'}</p>
);

const SidebarFooter = ({ activeFolderId }: { activeFolderId?: string | null }) => (
  <p>Plugin sidebar footer {activeFolderId ?? 'no-folder'}</p>
);

const ThreadListHeader = ({ threadCount }: { threadCount?: number }) => (
  <p>Plugin thread header {threadCount ?? 0}</p>
);

const ThreadDialogFooter = ({ action }: { action?: string }) => <p>Plugin dialog footer {action ?? 'idle'}</p>;

const ReaderFooter = ({ messageCount }: { messageCount?: number }) => (
  <p>Plugin reader footer {messageCount ?? 0}</p>
);

const OnboardingHeader = ({ step }: { step?: string }) => <p>Plugin onboarding header {step ?? 'unknown'}</p>;

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
    OnboardingHeader,
    PreferencesSection,
    ReaderFooter,
    SidebarFooter,
    SidebarHeader,
    StatusLeft,
    StatusRight,
    ThreadDialogFooter,
    ThreadListHeader
  }
};
