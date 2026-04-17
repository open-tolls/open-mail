import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nextThemeId, type ThemeId } from '@lib/themes';

export type LayoutMode = 'split' | 'list';

type UIState = {
  isSidebarCollapsed: boolean;
  layoutMode: LayoutMode;
  themeId: ThemeId;
  threadPanelWidth: number;
  setSidebarCollapsed: (isCollapsed: boolean) => void;
  toggleSidebar: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
  setThemeId: (themeId: ThemeId) => void;
  cycleTheme: () => void;
  setThreadPanelWidth: (width: number) => void;
};

const clampThreadPanelWidth = (width: number) => Math.min(72, Math.max(38, width));

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      layoutMode: 'split',
      themeId: 'system',
      threadPanelWidth: 58,
      setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setLayoutMode: (layoutMode) => set({ layoutMode }),
      toggleLayoutMode: () =>
        set((state) => ({
          layoutMode: state.layoutMode === 'split' ? 'list' : 'split'
        })),
      setThemeId: (themeId) => set({ themeId }),
      cycleTheme: () => set((state) => ({ themeId: nextThemeId(state.themeId) })),
      setThreadPanelWidth: (threadPanelWidth) =>
        set({ threadPanelWidth: clampThreadPanelWidth(threadPanelWidth) })
    }),
    {
      name: 'open-mail-ui'
    }
  )
);
