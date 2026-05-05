import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { extractTemplateVariables } from '@lib/template-utils';

export type EmailTemplate = {
  id: string;
  title: string;
  subject: string;
  body: string;
  variables: string[];
  accountId: string | null;
};

type TemplateInput = Omit<EmailTemplate, 'id' | 'variables'>;

type TemplateState = {
  templates: EmailTemplate[];
  create: (template: TemplateInput) => string;
  update: (id: string, template: TemplateInput) => void;
  delete: (id: string) => void;
  replaceState: (templates: EmailTemplate[]) => void;
};

const withVariables = (template: TemplateInput & { id: string }): EmailTemplate => ({
  ...template,
  variables: extractTemplateVariables(template.subject, template.body)
});

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      templates: [],
      create: (template) => {
        const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          templates: [...state.templates, withVariables({ ...template, id })]
        }));
        return id;
      },
      update: (id, template) =>
        set((state) => ({
          templates: state.templates.map((candidate) =>
            candidate.id === id ? withVariables({ ...template, id }) : candidate
          )
        })),
      delete: (id) =>
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id)
        })),
      replaceState: (templates) => set({ templates })
    }),
    {
      name: 'open-mail-templates'
    }
  )
);
