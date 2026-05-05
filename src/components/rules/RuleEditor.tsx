import { useEffect, useState } from 'react';
import {
  createMailRuleAction,
  createMailRuleCondition,
  type MailRule,
  type MailRuleActionType,
  type MailRuleField,
  type MailRuleMode,
  type MailRuleOperator
} from '@lib/mail-rules';
import type { AccountRecord } from '@stores/useAccountStore';

type RuleEditorProps = {
  accounts: AccountRecord[];
  editingRule: MailRule | null;
  onCancel: () => void;
  onSave: (rule: Omit<MailRule, 'id'>) => void;
};

const fieldOptions: Array<{ value: MailRuleField; label: string }> = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
  { value: 'has-attachment', label: 'Has attachment' }
];

const operatorOptions: Array<{ value: MailRuleOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'starts-with', label: 'Starts with' },
  { value: 'ends-with', label: 'Ends with' }
];

const actionOptions: Array<{ value: MailRuleActionType; label: string }> = [
  { value: 'move', label: 'Move to folder' },
  { value: 'label', label: 'Apply label' },
  { value: 'mark-read', label: 'Mark as read' },
  { value: 'star', label: 'Star' },
  { value: 'archive', label: 'Archive' },
  { value: 'trash', label: 'Trash' }
];

const valueLabelForAction = (actionType: MailRuleActionType) =>
  actionType === 'move' ? 'Folder id / role' : actionType === 'label' ? 'Label name' : 'Value';

export const RuleEditor = ({ accounts, editingRule, onCancel, onSave }: RuleEditorProps) => {
  const draft = editingRule ?? {
    accountId: null,
    name: '',
    enabled: true,
    mode: 'all' as MailRuleMode,
    conditions: [createMailRuleCondition()],
    actions: [createMailRuleAction()]
  };

  return (
    <section aria-label="Mail rule editor" className="rule-editor">
      <div className="template-editor-header">
        <div>
          <strong>{editingRule ? 'Edit rule' : 'New rule'}</strong>
          <p>Build local filtering rules before we wire the desktop processor.</p>
        </div>
        {editingRule ? (
          <button onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
      </div>
      <RuleEditorForm accounts={accounts} initialRule={draft} onSave={onSave} saveLabel={editingRule ? 'Save rule' : 'Create rule'} />
    </section>
  );
};

type RuleEditorFormProps = {
  accounts: AccountRecord[];
  initialRule: Omit<MailRule, 'id'>;
  onSave: (rule: Omit<MailRule, 'id'>) => void;
  saveLabel: string;
};

const RuleEditorForm = ({ accounts, initialRule, onSave, saveLabel }: RuleEditorFormProps) => {
  const [rule, setRule] = useState(initialRule);

  useEffect(() => {
    setRule(initialRule);
  }, [initialRule]);

  return (
    <>
      <div className="preferences-grid">
        <label className="preferences-field">
          <span>Name</span>
          <input
            onChange={(event) => setRule((current) => ({ ...current, name: event.target.value }))}
            placeholder="Newsletter to archive"
            value={rule.name}
          />
        </label>
        <label className="preferences-field">
          <span>Scope</span>
          <select
            onChange={(event) =>
              setRule((current) => ({
                ...current,
                accountId: event.target.value === 'global' ? null : event.target.value
              }))
            }
            value={rule.accountId ?? 'global'}
          >
            <option value="global">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="preferences-field">
          <span>Condition mode</span>
          <select
            onChange={(event) =>
              setRule((current) => ({ ...current, mode: event.target.value as MailRuleMode }))
            }
            value={rule.mode}
          >
            <option value="all">All conditions must match</option>
            <option value="any">Any condition can match</option>
          </select>
        </label>
      </div>
      <div className="rule-block-list">
        <div className="rule-block">
          <div className="rule-block-header">
            <strong>Conditions</strong>
            <button
              onClick={() =>
                setRule((current) => ({
                  ...current,
                  conditions: [...current.conditions, createMailRuleCondition()]
                }))
              }
              type="button"
            >
              Add condition
            </button>
          </div>
          <div className="rule-entry-list">
            {rule.conditions.map((condition) => (
              <div className="rule-entry" key={condition.id}>
                <select
                  onChange={(event) =>
                    setRule((current) => ({
                      ...current,
                      conditions: current.conditions.map((candidate) =>
                        candidate.id === condition.id
                          ? { ...candidate, field: event.target.value as MailRuleField }
                          : candidate
                      )
                    }))
                  }
                  value={condition.field}
                >
                  {fieldOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  onChange={(event) =>
                    setRule((current) => ({
                      ...current,
                      conditions: current.conditions.map((candidate) =>
                        candidate.id === condition.id
                          ? { ...candidate, operator: event.target.value as MailRuleOperator }
                          : candidate
                      )
                    }))
                  }
                  value={condition.operator}
                >
                  {operatorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  onChange={(event) =>
                    setRule((current) => ({
                      ...current,
                      conditions: current.conditions.map((candidate) =>
                        candidate.id === condition.id ? { ...candidate, value: event.target.value } : candidate
                      )
                    }))
                  }
                  placeholder={condition.field === 'has-attachment' ? 'true' : 'Value'}
                  value={condition.value}
                />
                <button
                  disabled={rule.conditions.length === 1}
                  onClick={() =>
                    setRule((current) => ({
                      ...current,
                      conditions: current.conditions.filter((candidate) => candidate.id !== condition.id)
                    }))
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="rule-block">
          <div className="rule-block-header">
            <strong>Actions</strong>
            <button
              onClick={() =>
                setRule((current) => ({
                  ...current,
                  actions: [...current.actions, createMailRuleAction()]
                }))
              }
              type="button"
            >
              Add action
            </button>
          </div>
          <div className="rule-entry-list">
            {rule.actions.map((action) => (
              <div className="rule-entry" key={action.id}>
                <select
                  onChange={(event) =>
                    setRule((current) => ({
                      ...current,
                      actions: current.actions.map((candidate) =>
                        candidate.id === action.id
                          ? { ...candidate, type: event.target.value as MailRuleActionType }
                          : candidate
                      )
                    }))
                  }
                  value={action.type}
                >
                  {actionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {action.type === 'move' || action.type === 'label' ? (
                  <input
                    onChange={(event) =>
                      setRule((current) => ({
                        ...current,
                        actions: current.actions.map((candidate) =>
                          candidate.id === action.id ? { ...candidate, value: event.target.value } : candidate
                        )
                      }))
                    }
                    placeholder={valueLabelForAction(action.type)}
                    value={action.value}
                  />
                ) : (
                  <input disabled placeholder="No extra value needed" value="" />
                )}
                <button
                  disabled={rule.actions.length === 1}
                  onClick={() =>
                    setRule((current) => ({
                      ...current,
                      actions: current.actions.filter((candidate) => candidate.id !== action.id)
                    }))
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="template-editor-actions">
        <label className="rule-enabled-toggle">
          <input
            checked={rule.enabled}
            onChange={(event) => setRule((current) => ({ ...current, enabled: event.target.checked }))}
            type="checkbox"
          />
          Enabled
        </label>
        <button
          className="preferences-primary-button"
          disabled={!rule.name.trim() || !rule.conditions.length || !rule.actions.length}
          onClick={() => onSave(rule)}
          type="button"
        >
          {saveLabel}
        </button>
      </div>
    </>
  );
};
