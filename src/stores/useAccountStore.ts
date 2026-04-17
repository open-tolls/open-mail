import { create } from 'zustand';
import type { AccountProvider } from '@lib/contracts';

export type AccountRecord = {
  id: string;
  provider: AccountProvider;
  email: string;
  displayName: string;
};

type AccountState = {
  accounts: AccountRecord[];
  selectedAccountId: string | null;
  setAccounts: (accounts: AccountRecord[]) => void;
  selectAccount: (accountId: string | null) => void;
  upsertAccount: (account: AccountRecord) => void;
  removeAccount: (accountId: string) => void;
};

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  selectedAccountId: null,
  setAccounts: (accounts) =>
    set((state) => ({
      accounts,
      selectedAccountId:
        state.selectedAccountId && accounts.some((account) => account.id === state.selectedAccountId)
          ? state.selectedAccountId
          : accounts[0]?.id ?? null
    })),
  selectAccount: (selectedAccountId) => set({ selectedAccountId }),
  upsertAccount: (account) =>
    set((state) => {
      const exists = state.accounts.some((candidate) => candidate.id === account.id);
      const accounts = exists
        ? state.accounts.map((candidate) => (candidate.id === account.id ? account : candidate))
        : [...state.accounts, account];

      return {
        accounts,
        selectedAccountId: state.selectedAccountId ?? account.id
      };
    }),
  removeAccount: (accountId) =>
    set((state) => {
      const accounts = state.accounts.filter((account) => account.id !== accountId);

      return {
        accounts,
        selectedAccountId: state.selectedAccountId === accountId ? accounts[0]?.id ?? null : state.selectedAccountId
      };
    })
}));
