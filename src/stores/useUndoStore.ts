import { create } from 'zustand';

export type UndoAction = {
  id: string;
  description: string;
  timestamp: number;
  undo: () => Promise<void> | void;
};

type UndoState = {
  actions: UndoAction[];
  currentToast: UndoAction | null;
  dismiss: () => void;
  push: (action: UndoAction) => void;
  undo: () => Promise<void>;
};

export const useUndoStore = create<UndoState>((set, get) => ({
  actions: [],
  currentToast: null,
  dismiss: () => set({ currentToast: null }),
  push: (action) =>
    set((state) => ({
      actions: [action, ...state.actions].slice(0, 20),
      currentToast: action
    })),
  undo: async () => {
    const action = get().currentToast ?? get().actions[0];

    if (!action) {
      return;
    }

    await action.undo();
    set((state) => ({
      actions: state.actions.filter((candidate) => candidate.id !== action.id),
      currentToast: null
    }));
  }
}));
