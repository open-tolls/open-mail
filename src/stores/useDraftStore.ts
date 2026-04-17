import { create } from 'zustand';
import type { MailAddress } from '@lib/contracts';

export type DraftRecord = {
  id: string;
  accountId: string;
  to: MailAddress[];
  subject: string;
  body: string;
  updatedAt: string;
};

type DraftState = {
  drafts: DraftRecord[];
  activeDraftId: string | null;
  setDrafts: (drafts: DraftRecord[]) => void;
  editDraft: (draft: DraftRecord) => void;
  selectDraft: (draftId: string | null) => void;
  removeDraft: (draftId: string) => void;
};

export const useDraftStore = create<DraftState>((set) => ({
  drafts: [],
  activeDraftId: null,
  setDrafts: (drafts) =>
    set((state) => ({
      drafts,
      activeDraftId:
        state.activeDraftId && drafts.some((draft) => draft.id === state.activeDraftId)
          ? state.activeDraftId
          : drafts[0]?.id ?? null
    })),
  editDraft: (draft) =>
    set((state) => {
      const exists = state.drafts.some((candidate) => candidate.id === draft.id);

      return {
        drafts: exists ? state.drafts.map((candidate) => (candidate.id === draft.id ? draft : candidate)) : [...state.drafts, draft],
        activeDraftId: draft.id
      };
    }),
  selectDraft: (activeDraftId) => set({ activeDraftId }),
  removeDraft: (draftId) =>
    set((state) => {
      const drafts = state.drafts.filter((draft) => draft.id !== draftId);

      return {
        drafts,
        activeDraftId: state.activeDraftId === draftId ? drafts[0]?.id ?? null : state.activeDraftId
      };
    })
}));
