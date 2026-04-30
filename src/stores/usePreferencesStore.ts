import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  fontSize: number;
  density: PreferenceDensity;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationScope: NotificationScope;
  quietHoursStart: string;
  quietHoursEnd: string;
  developerToolsEnabled: boolean;
  logLevel: LogLevel;
  setPreference: <Key extends keyof Omit<
    PreferencesState,
    'setPreference' | 'resetPreferences'
  >>(key: Key, value: PreferencesState[Key]) => void;
  resetPreferences: () => void;
};

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
  fontSize: 16,
  density: 'comfortable',
  notificationsEnabled: true,
  notificationSound: true,
  notificationScope: 'inbox',
  quietHoursStart: '',
  quietHoursEnd: '',
  developerToolsEnabled: false,
  logLevel: 'info'
} satisfies Omit<PreferencesState, 'setPreference' | 'resetPreferences'>;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaultPreferencesState,
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
