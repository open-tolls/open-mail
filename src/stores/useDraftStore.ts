import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MessageRecord } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';

export type DraftRecord = {
  id: string;
  accountId: string;
  bcc: string[];
  body: string;
  cc: string[];
  fromAccountId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  to: string[];
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

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
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
            drafts: exists
              ? state.drafts.map((candidate) => (candidate.id === draft.id ? draft : candidate))
              : [...state.drafts, draft],
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
    }),
    {
      name: 'open-mail-drafts'
    }
  )
);

const toDraftRecord = (message: MessageRecord): DraftRecord => ({
  id: message.id,
  accountId: message.account_id,
  bcc: message.bcc.map((contact) => contact.email),
  body: message.body,
  cc: message.cc.map((contact) => contact.email),
  fromAccountId: message.account_id,
  inReplyTo: message.in_reply_to,
  references: message.references,
  subject: message.subject,
  to: message.to.map((contact) => contact.email),
  updatedAt: message.updated_at
});

export const hydrateDraftStore = async (accountId: string) => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  const drafts = await api.drafts.list(accountId);
  useDraftStore.getState().setDrafts(drafts.map(toDraftRecord));
};

export const saveDraftToBackend = async (draft: DraftRecord) => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  await api.drafts.save({
    id: draft.id,
    accountId: draft.accountId,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    body: draft.body,
    inReplyTo: draft.inReplyTo,
    references: draft.references
  });
};

export const deleteDraftFromBackend = async (accountId: string, draftId: string) => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  await api.drafts.delete(accountId, draftId);
};
