import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MailRule } from '@lib/mail-rules';

type MailRulesState = {
  rules: MailRule[];
  create: (rule: Omit<MailRule, 'id'>) => string;
  update: (id: string, rule: Omit<MailRule, 'id'>) => void;
  delete: (id: string) => void;
  replaceState: (rules: MailRule[]) => void;
};

export const useMailRulesStore = create<MailRulesState>()(
  persist(
    (set) => ({
      rules: [],
      create: (rule) => {
        const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          rules: [...state.rules, { ...rule, id }]
        }));
        return id;
      },
      update: (id, rule) =>
        set((state) => ({
          rules: state.rules.map((candidate) => (candidate.id === id ? { ...rule, id } : candidate))
        })),
      delete: (id) =>
        set((state) => ({
          rules: state.rules.filter((rule) => rule.id !== id)
        })),
      replaceState: (rules) => set({ rules })
    }),
    {
      name: 'open-mail-rules'
    }
  )
);
