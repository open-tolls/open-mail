import type { AccountRecord } from '@stores/useAccountStore';
import type { EmailTemplate } from '@stores/useTemplateStore';

type TemplateListProps = {
  accounts: AccountRecord[];
  templates: EmailTemplate[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
};

const resolveTemplateScope = (accounts: AccountRecord[], accountId: string | null) => {
  if (!accountId) {
    return 'Global';
  }

  return accounts.find((account) => account.id === accountId)?.displayName ?? 'Account template';
};

export const TemplateList = ({ accounts, templates, onDelete, onEdit }: TemplateListProps) => {
  if (!templates.length) {
    return <p className="preferences-note">No templates yet. Create one here and apply it from the composer.</p>;
  }

  return (
    <div className="template-list" aria-label="Template list">
      {templates.map((template) => (
        <article className="template-card" key={template.id}>
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
