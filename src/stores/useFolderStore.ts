import { create } from 'zustand';
import type { FolderRecord } from '@lib/contracts';

type FolderState = {
  folders: FolderRecord[];
  selectedFolderId: string | null;
  setFolders: (folders: FolderRecord[]) => void;
  selectFolder: (folderId: string | null) => void;
  updateUnreadCount: (folderId: string, unreadCount: number) => void;
};

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],
  selectedFolderId: null,
  setFolders: (folders) =>
    set((state) => ({
      folders,
      selectedFolderId:
        state.selectedFolderId && folders.some((folder) => folder.id === state.selectedFolderId)
          ? state.selectedFolderId
          : folders[0]?.id ?? null
    })),
  selectFolder: (selectedFolderId) => set({ selectedFolderId }),
  updateUnreadCount: (folderId, unreadCount) =>
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === folderId ? { ...folder, unread_count: Math.max(0, unreadCount) } : folder
      )
    }))
}));
