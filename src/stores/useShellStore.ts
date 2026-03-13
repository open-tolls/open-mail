import { create } from 'zustand';

type ShellState = {
  activeFolder: string;
  setActiveFolder: (folder: string) => void;
};

export const useShellStore = create<ShellState>((set) => ({
  activeFolder: 'Inbox',
  setActiveFolder: (activeFolder) => set({ activeFolder })
}));

