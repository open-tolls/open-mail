import { create } from 'zustand';
import type { FolderRecord, MailboxReadModel, SyncState, ThreadSummary } from '@lib/contracts';

type ShellState = {
  activeFolder: string;
  syncState: SyncState;
  folders: FolderRecord[];
  threads: ThreadSummary[];
  setActiveFolder: (folder: string) => void;
  hydrateMailbox: (mailbox: MailboxReadModel) => void;
};

export const useShellStore = create<ShellState>((set) => ({
  activeFolder: 'Inbox',
  syncState: { kind: 'not-started' },
  folders: [],
  threads: [],
  setActiveFolder: (activeFolder) => set({ activeFolder }),
  hydrateMailbox: (mailbox) =>
    set({
      activeFolder: mailbox.activeFolder,
      syncState: mailbox.syncState,
      folders: mailbox.folders,
      threads: mailbox.threads
    })
}));
