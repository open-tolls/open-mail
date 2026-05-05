import { useEffect, useState } from 'react';
import type { AccountRecord } from '@stores/useAccountStore';
import type { EmailTemplate } from '@stores/useTemplateStore';

type TemplateEditorProps = {
  accounts: AccountRecord[];
  editingTemplate: EmailTemplate | null;
  onCancel: () => void;
  onSave: (template: {
    title: string;
    subject: string;
    body: string;
    accountId: string | null;
  }) => void;
};

export const TemplateEditor = ({ accounts, editingTemplate, onCancel, onSave }: TemplateEditorProps) => {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [accountId, setAccountId] = useState<string>('global');

  useEffect(() => {
    if (!editingTemplate) {
      setTitle('');
      setSubject('');
      setBody('');
      setAccountId('global');
      return;
    }

    setTitle(editingTemplate.title);
    setSubject(editingTemplate.subject);
    setBody(editingTemplate.body);
    setAccountId(editingTemplate.accountId ?? 'global');
  }, [editingTemplate]);

  return (
    <section className="template-editor" aria-label="Template editor">
      <div className="template-editor-header">
        <div>
          <strong>{editingTemplate ? 'Edit template' : 'New template'}</strong>
          <p>Use <code>{'{{name}}'}</code> style variables in the subject or body.</p>
        </div>
        {editingTemplate ? (
          <button onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
      </div>
      <div className="preferences-grid">
        <label className="preferences-field">
          <span>Title</span>
          <input onChange={(event) => setTitle(event.target.value)} placeholder="Weekly check-in" value={title} />
        </label>
        <label className="preferences-field">
          <span>Scope</span>
          <select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
            <option value="global">Global template</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="preferences-field template-editor-subject">
          <span>Subject</span>
          <input
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Following up on {{project}}"
            value={subject}
          />
        </label>
      </div>
      <label className="preferences-field template-editor-body">
        <span>Body (HTML)</span>
        <textarea
          onChange={(event) => setBody(event.target.value)}
          placeholder="<p>Hello {{name}},</p><p>Quick follow-up.</p>"
          rows={8}
          value={body}
        />
      </label>
      <div className="template-editor-actions">
        <button
          className="preferences-primary-button"
          disabled={!title.trim() || !body.trim()}
          onClick={() =>
            onSave({
              title: title.trim(),
              subject: subject.trim(),
              body: body.trim(),
              accountId: accountId === 'global' ? null : accountId
            })
          }
          type="button"
        >
          {editingTemplate ? 'Save template' : 'Create template'}
        </button>
      </div>
    </section>
  );
};
