import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { useAccountStore } from '@stores/useAccountStore';
import { defaultShortcutBindings, useShortcutStore } from '@stores/useShortcutStore';
import { useDraftStore } from '@stores/useDraftStore';
import { usePreferencesStore } from '@stores/usePreferencesStore';
import { useSignatureStore } from '@stores/useSignatureStore';
import { useThreadStore } from '@stores/useThreadStore';
import { useUndoStore } from '@stores/useUndoStore';
import { useUIStore } from '@stores/useUIStore';

beforeEach(() => {
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
  useUIStore.setState({
    isSidebarCollapsed: false,
    layoutMode: 'split',
    themeId: 'system',
    threadPanelWidth: 58
  });
  useShortcutStore.setState({
    bindings: defaultShortcutBindings
  });
  useAccountStore.setState({
    accounts: [],
    selectedAccountId: null
  });
  useDraftStore.setState({
    drafts: [],
    activeDraftId: null
  });
  useSignatureStore.setState({
    signatures: [
      {
        id: 'sig_default',
        title: 'Default signature',
        body: '<p>Best,<br />Leco</p>',
        accountId: null
      }
    ],
    defaultSignatureId: 'sig_default',
    defaultSignatureIdsByAccountId: {}
  });
  usePreferencesStore.setState({
    language: 'English',
    defaultAccountId: null,
    markAsReadOnOpen: true,
    showSnippets: true,
    autoLoadImages: false,
    includeSignatureInReplies: true,
    requestReadReceipts: false,
    undoSendDelaySeconds: 5,
    launchAtLogin: true,
    checkForUpdates: true,
    minimizeToTray: false,
    fontSize: 16,
    density: 'comfortable',
    notificationsEnabled: true,
    notificationSound: true,
    notificationScope: 'inbox',
    quietHoursStart: '',
    quietHoursEnd: '',
    developerToolsEnabled: false,
    logLevel: 'info'
  });
  useThreadStore.setState({
    activeFolderKey: null,
    hasMore: false,
    hasMoreByFolderKey: {},
    isLoading: false,
    offset: 0,
    offsetByFolderKey: {},
    threadRecords: [],
    threads: [],
    threadsByFolderKey: {},
    threadSummaries: [],
    selectedThreadId: null
  });
  useUndoStore.setState({ actions: [], currentToast: null });
});
