import { type KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';
import type { MailRule } from '@lib/mail-rules';
import type { AccountRecord } from '@stores/useAccountStore';

type RuleListProps = {
  accounts: AccountRecord[];
  selectedRuleId?: string | null;
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

export const RuleList = ({ accounts, selectedRuleId = null, onDelete, onEdit, rules }: RuleListProps) => {
  const ruleRefs = useRef<Record<string, HTMLElement | null>>({});

  if (!rules.length) {
    return <p className="preferences-note">No rules yet. This first cut stores the builder locally and validates matching logic in tests.</p>;
  }

  const focusRuleByIndex = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, rules.length - 1));
    const targetRule = rules[clampedIndex];
    if (!targetRule) {
      return;
    }

    ruleRefs.current[targetRule.id]?.focus();
  };

  const handleRuleKeyDown =
    (ruleId: string) => (event: ReactKeyboardEvent<HTMLElement>) => {
      const currentIndex = rules.findIndex((rule) => rule.id === ruleId);
      if (currentIndex === -1) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        focusRuleByIndex(currentIndex + 1);
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        focusRuleByIndex(currentIndex - 1);
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusRuleByIndex(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusRuleByIndex(rules.length - 1);
      }
    };

  return (
    <div className="rule-list" aria-label="Mail rules list" role="listbox">
      {rules.map((rule) => (
        <article
          aria-selected={rule.id === selectedRuleId}
          className="rule-card"
          key={rule.id}
          onKeyDown={handleRuleKeyDown(rule.id)}
          ref={(element) => {
            ruleRefs.current[rule.id] = element;
          }}
          role="option"
          tabIndex={0}
        >
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
