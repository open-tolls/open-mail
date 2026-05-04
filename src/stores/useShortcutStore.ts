import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ShortcutAction =
  | 'action.redo'
  | 'action.undo'
  | 'compose.new'
  | 'compose.newWindow'
  | 'compose.send'
  | 'nav.drafts'
  | 'nav.inbox'
  | 'nav.sent'
  | 'preferences.open'
  | 'search.focus'
  | 'thread.archive'
  | 'thread.forward'
  | 'thread.label'
  | 'thread.move'
  | 'thread.next'
  | 'thread.prev'
  | 'thread.reply'
  | 'thread.replyAll'
  | 'thread.star'
  | 'thread.snooze'
  | 'thread.trash'
  | 'ui.back';

export type ShortcutBindings = Record<ShortcutAction, string>;

export const defaultShortcutBindings: ShortcutBindings = {
  'action.redo': 'mod+shift+z',
  'action.undo': 'mod+z',
  'compose.new': 'mod+n',
  'compose.newWindow': 'mod+shift+n',
  'compose.send': 'mod+enter',
  'nav.drafts': 'mod+3',
  'nav.inbox': 'mod+1',
  'nav.sent': 'mod+2',
  'preferences.open': 'mod+,',
  'search.focus': 'mod+k',
  'thread.archive': 'e',
  'thread.forward': 'f',
  'thread.label': 'l',
  'thread.move': 'v',
  'thread.next': 'j',
  'thread.prev': 'k',
  'thread.reply': 'r',
  'thread.replyAll': 'a',
  'thread.star': 's',
  'thread.snooze': 'b',
  'thread.trash': '#',
  'ui.back': 'escape'
};

type ShortcutState = {
  bindings: ShortcutBindings;
  resetShortcutBindings: () => void;
  setShortcutBinding: (action: ShortcutAction, shortcut: string) => void;
};

export const normalizeShortcutBinding = (shortcut: string) => shortcut.trim().toLowerCase();

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      bindings: defaultShortcutBindings,
      resetShortcutBindings: () => set({ bindings: defaultShortcutBindings }),
      setShortcutBinding: (action, shortcut) =>
        set((state) => ({
          bindings: {
            ...state.bindings,
            [action]: normalizeShortcutBinding(shortcut)
          }
        }))
    }),
    {
      name: 'open-mail-shortcuts'
    }
  )
);
