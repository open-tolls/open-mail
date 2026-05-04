import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppConfig } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import { useUIStore } from '@stores/useUIStore';

export type PreferenceDensity = 'comfortable' | 'compact';
export type NotificationScope = 'inbox' | 'all';
export type LogLevel = 'info' | 'debug' | 'trace';

type PreferencesState = {
  language: string;
  defaultAccountId: string | null;
  markAsReadOnOpen: boolean;
  showSnippets: boolean;
  autoLoadImages: boolean;
  includeSignatureInReplies: boolean;
  requestReadReceipts: boolean;
  undoSendDelaySeconds: number;
  launchAtLogin: boolean;
  checkForUpdates: boolean;
  minimizeToTray: boolean;
  fontSize: number;
  density: PreferenceDensity;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationScope: NotificationScope;
  quietHoursStart: string;
  quietHoursEnd: string;
  developerToolsEnabled: boolean;
  logLevel: LogLevel;
  replaceState: (nextState: PreferencesSnapshot) => void;
  setPreference: <Key extends keyof Omit<
    PreferencesState,
    'replaceState' | 'setPreference' | 'resetPreferences'
  >>(key: Key, value: PreferencesState[Key]) => void;
  resetPreferences: () => void;
};

export type PreferencesSnapshot = Omit<
  PreferencesState,
  'replaceState' | 'setPreference' | 'resetPreferences'
>;

const defaultPreferencesState = {
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
} satisfies PreferencesSnapshot;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaultPreferencesState,
      replaceState: (nextState) => set(nextState),
      setPreference: (key, value) =>
        set({
          [key]: value
        } as Pick<PreferencesState, typeof key>),
      resetPreferences: () => set(defaultPreferencesState)
    }),
    {
      name: 'open-mail-preferences'
    }
  )
);

export const defaultPreferences = defaultPreferencesState;

const toPreferencesSnapshot = (config: AppConfig): PreferencesSnapshot => ({
  language: config.language,
  defaultAccountId: config.defaultAccountId,
  markAsReadOnOpen: config.markAsReadOnOpen,
  showSnippets: config.showSnippets,
  autoLoadImages: config.autoLoadImages,
  includeSignatureInReplies: config.includeSignatureInReplies,
  requestReadReceipts: config.requestReadReceipts,
  undoSendDelaySeconds: config.undoSendDelaySeconds,
  launchAtLogin: config.launchAtLogin,
  checkForUpdates: config.checkForUpdates,
  minimizeToTray: config.minimizeToTray,
  fontSize: config.fontSize,
  density: config.density as PreferenceDensity,
  notificationsEnabled: config.notificationsEnabled,
  notificationSound: config.notificationSound,
  notificationScope: config.notificationScope as NotificationScope,
  quietHoursStart: config.quietHoursStart,
  quietHoursEnd: config.quietHoursEnd,
  developerToolsEnabled: config.developerToolsEnabled,
  logLevel: config.logLevel as LogLevel
});

export const hydratePreferencesStore = async () => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  const config = await api.config.get();
  usePreferencesStore.getState().replaceState(toPreferencesSnapshot(config));
  useUIStore.setState({
    themeId: config.theme as 'system' | 'dark' | 'light',
    layoutMode: config.layoutMode as 'split' | 'list',
    threadPanelWidth: config.threadPanelWidth
  });
};

export const savePreferencesToBackend = async () => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  const preferences = usePreferencesStore.getState();
  const ui = useUIStore.getState();

  await api.config.update({
    language: preferences.language,
    defaultAccountId: preferences.defaultAccountId,
    markAsReadOnOpen: preferences.markAsReadOnOpen,
    showSnippets: preferences.showSnippets,
    autoLoadImages: preferences.autoLoadImages,
    includeSignatureInReplies: preferences.includeSignatureInReplies,
    requestReadReceipts: preferences.requestReadReceipts,
    undoSendDelaySeconds: preferences.undoSendDelaySeconds,
    launchAtLogin: preferences.launchAtLogin,
    checkForUpdates: preferences.checkForUpdates,
    minimizeToTray: preferences.minimizeToTray,
    theme: ui.themeId,
    fontSize: preferences.fontSize,
    layoutMode: ui.layoutMode,
    density: preferences.density,
    threadPanelWidth: ui.threadPanelWidth,
    notificationsEnabled: preferences.notificationsEnabled,
    notificationSound: preferences.notificationSound,
    notificationScope: preferences.notificationScope,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
    developerToolsEnabled: preferences.developerToolsEnabled,
    logLevel: preferences.logLevel
  });
};
