import type { MailRule } from '@lib/mail-rules';
import type { AccountRecord } from '@stores/useAccountStore';

type RuleListProps = {
  accounts: AccountRecord[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  rules: MailRule[];
};

const describeScope = (accounts: AccountRecord[], accountId: string | null) => {
  if (!accountId) {
    return 'All accounts';
  }

  return accounts.find((account) => account.id === accountId)?.displayName ?? 'Account scope';
};

const describeCondition = (condition: MailRule['conditions'][number]) => {
  const field = condition.field === 'has-attachment' ? 'Has attachment' : condition.field;
  const operator =
    condition.operator === 'starts-with'
      ? 'starts with'
      : condition.operator === 'ends-with'
        ? 'ends with'
        : condition.operator;
  return `${field} ${operator} ${condition.value || '(empty)'}`;
};

const describeAction = (action: MailRule['actions'][number]) => {
  if (action.type === 'move') {
    return `Move to ${action.value || '(folder)'}`;
  }

  if (action.type === 'label') {
    return `Apply label ${action.value || '(label)'}`;
  }

  if (action.type === 'mark-read') {
    return 'Mark as read';
  }

  if (action.type === 'star') {
    return 'Star';
  }

  if (action.type === 'trash') {
    return 'Trash';
  }

  return 'Archive';
};

export const RuleList = ({ accounts, onDelete, onEdit, rules }: RuleListProps) => {
  if (!rules.length) {
    return <p className="preferences-note">No rules yet. This first cut stores the builder locally and validates matching logic in tests.</p>;
  }

  return (
    <div className="rule-list" aria-label="Mail rules list">
      {rules.map((rule) => (
        <article className="rule-card" key={rule.id}>
          <div>
            <strong>{rule.name}</strong>
            <p>{describeScope(accounts, rule.accountId)} · {rule.enabled ? 'Enabled' : 'Disabled'} · Match {rule.mode.toUpperCase()}</p>
            <div className="rule-summary-list">
              <div>
                <span className="rule-summary-title">If</span>
                {rule.conditions.map((condition) => (
                  <p key={condition.id}>{describeCondition(condition)}</p>
                ))}
              </div>
              <div>
                <span className="rule-summary-title">Then</span>
                {rule.actions.map((action) => (
                  <p key={action.id}>{describeAction(action)}</p>
                ))}
              </div>
            </div>
          </div>
          <div className="preferences-account-actions">
            <button onClick={() => onEdit(rule.id)} type="button">
              Edit
            </button>
            <button onClick={() => onDelete(rule.id)} type="button">
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};
