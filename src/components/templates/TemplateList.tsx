import { type KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';
import type { AccountRecord } from '@stores/useAccountStore';
import type { EmailTemplate } from '@stores/useTemplateStore';

type TemplateListProps = {
  accounts: AccountRecord[];
  templates: EmailTemplate[];
  selectedTemplateId?: string | null;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
};

const resolveTemplateScope = (accounts: AccountRecord[], accountId: string | null) => {
  if (!accountId) {
    return 'Global';
  }

  return accounts.find((account) => account.id === accountId)?.displayName ?? 'Account template';
};

export const TemplateList = ({ accounts, templates, selectedTemplateId = null, onDelete, onEdit }: TemplateListProps) => {
  const templateRefs = useRef<Record<string, HTMLElement | null>>({});

  if (!templates.length) {
    return <p className="preferences-note">No templates yet. Create one here and apply it from the composer.</p>;
  }

  const focusTemplateByIndex = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, templates.length - 1));
    const targetTemplate = templates[clampedIndex];
    if (!targetTemplate) {
      return;
    }

    templateRefs.current[targetTemplate.id]?.focus();
  };

  const handleTemplateKeyDown =
    (templateId: string) => (event: ReactKeyboardEvent<HTMLElement>) => {
      const currentIndex = templates.findIndex((template) => template.id === templateId);
      if (currentIndex === -1) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        focusTemplateByIndex(currentIndex + 1);
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        focusTemplateByIndex(currentIndex - 1);
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusTemplateByIndex(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusTemplateByIndex(templates.length - 1);
      }
    };

  return (
    <div className="template-list" aria-label="Template list" role="listbox">
      {templates.map((template) => (
        <article
          aria-selected={template.id === selectedTemplateId}
          className="template-card"
          key={template.id}
          onKeyDown={handleTemplateKeyDown(template.id)}
          ref={(element) => {
            templateRefs.current[template.id] = element;
          }}
          role="option"
          tabIndex={0}
        >
          <div>
            <strong>{template.title}</strong>
            <p>{template.subject || 'No subject override'}</p>
            <span>{resolveTemplateScope(accounts, template.accountId)}</span>
            {template.variables.length ? (
              <p className="template-variables">Variables: {template.variables.map((variable) => `{{${variable}}}`).join(', ')}</p>
            ) : null}
          </div>
          <div className="preferences-account-actions">
            <button onClick={() => onEdit(template.id)} type="button">
              Edit
            </button>
            <button onClick={() => onDelete(template.id)} type="button">
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};
