import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SignatureSettings } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';

export type Signature = {
  id: string;
  title: string;
  body: string;
  accountId: string | null;
};

type SignatureState = {
  signatures: Signature[];
  defaultSignatureId: string | null;
  defaultSignatureIdsByAccountId: Record<string, string | null>;
  replaceState: (nextState: Pick<SignatureState, 'signatures' | 'defaultSignatureId' | 'defaultSignatureIdsByAccountId'>) => void;
  create: (signature: Omit<Signature, 'id'>) => string;
  update: (id: string, signature: Partial<Omit<Signature, 'id'>>) => void;
  delete: (id: string) => void;
  setDefault: (id: string | null, accountId?: string | null) => void;
};

export const resolveSignatureForAccount = (
  signatures: Signature[],
  defaultSignatureId: string | null,
  defaultSignatureIdsByAccountId: Record<string, string | null>,
  accountId: string
) => {
  const accountDefaultId = defaultSignatureIdsByAccountId[accountId] ?? null;
  const accountDefaultSignature = signatures.find((signature) => signature.id === accountDefaultId) ?? null;

  if (accountDefaultSignature?.accountId === accountId) {
    return accountDefaultSignature;
  }

  const defaultSignature = signatures.find((signature) => signature.id === defaultSignatureId) ?? null;

  if (defaultSignature?.accountId === null || defaultSignature?.accountId === accountId) {
    return defaultSignature;
  }

  return signatures.find((signature) => signature.accountId === accountId) ?? signatures.find((signature) => signature.accountId === null) ?? null;
};

const defaultSignature = {
  id: 'sig_default',
  title: 'Default signature',
  body: '<p>Best,<br />Leco</p>',
  accountId: null
} satisfies Signature;

const defaultSignatureState = {
  signatures: [defaultSignature],
  defaultSignatureId: defaultSignature.id,
  defaultSignatureIdsByAccountId: {}
} satisfies Pick<SignatureState, 'signatures' | 'defaultSignatureId' | 'defaultSignatureIdsByAccountId'>;

const toSnapshot = (settings: SignatureSettings) => ({
  signatures: settings.signatures.map((signature) => ({
    id: signature.id,
    title: signature.title,
    body: signature.body,
    accountId: signature.accountId
  })),
  defaultSignatureId: settings.defaultSignatureId,
  defaultSignatureIdsByAccountId: settings.defaultSignatureIdsByAccountId
});

export const useSignatureStore = create<SignatureState>()(
  persist(
    (set) => ({
      ...defaultSignatureState,
      replaceState: (nextState) => set(nextState),
      create: (signature) => {
        const id = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          signatures: [...state.signatures, { ...signature, id }]
        }));
        return id;
      },
      update: (id, signature) =>
        set((state) => ({
          signatures: state.signatures.map((candidate) =>
            candidate.id === id ? { ...candidate, ...signature } : candidate
          )
        })),
      delete: (id) =>
        set((state) => {
          const signatures = state.signatures.filter((signature) => signature.id !== id);
          const defaultSignatureIdsByAccountId = Object.fromEntries(
            Object.entries(state.defaultSignatureIdsByAccountId).map(([accountId, signatureId]) => [
              accountId,
              signatureId === id ? null : signatureId
            ])
          );
          return {
            signatures,
            defaultSignatureId:
              state.defaultSignatureId === id ? signatures[0]?.id ?? null : state.defaultSignatureId,
            defaultSignatureIdsByAccountId
          };
        }),
      setDefault: (signatureId, accountId) =>
        set((state) =>
          accountId
            ? {
                defaultSignatureIdsByAccountId: {
                  ...state.defaultSignatureIdsByAccountId,
                  [accountId]: signatureId
                }
              }
            : {
                defaultSignatureId: signatureId
              }
        )
    }),
    {
      name: 'open-mail-signatures'
    }
  )
);

export const hydrateSignatureStore = async () => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  const settings = await api.signatures.list();
  useSignatureStore.getState().replaceState(toSnapshot(settings));
};

export const saveSignatureToBackend = async (signature: Signature) => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  await api.signatures.save(signature);
};

export const deleteSignatureFromBackend = async (id: string) => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  await api.signatures.delete(id);
};

export const setDefaultSignatureOnBackend = async (signatureId: string | null, accountId?: string | null) => {
  if (!tauriRuntime.isAvailable()) {
    return;
  }

  await api.signatures.setDefault(signatureId, accountId);
};
