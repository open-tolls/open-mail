export type MailRuleField = 'from' | 'to' | 'subject' | 'body' | 'has-attachment';
export type MailRuleOperator = 'contains' | 'equals' | 'starts-with' | 'ends-with';
export type MailRuleActionType = 'move' | 'label' | 'mark-read' | 'star' | 'archive' | 'trash';
export type MailRuleMode = 'all' | 'any';

export type MailRuleCondition = {
  id: string;
  field: MailRuleField;
  operator: MailRuleOperator;
  value: string;
};

export type MailRuleAction = {
  id: string;
  type: MailRuleActionType;
  value: string;
};

export type MailRule = {
  id: string;
  accountId: string | null;
  name: string;
  enabled: boolean;
  mode: MailRuleMode;
  conditions: MailRuleCondition[];
  actions: MailRuleAction[];
};

export type MailRuleCandidate = {
  from: string;
  to: string;
  subject: string;
  body: string;
  hasAttachment: boolean;
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const conditionMatches = (candidate: MailRuleCandidate, condition: MailRuleCondition) => {
  if (condition.field === 'has-attachment') {
    const expected = normalizeText(condition.value);
    const expectedValue = expected === 'true' || expected === 'yes' || expected === '1' || expected === '';
    return candidate.hasAttachment === expectedValue;
  }

  const source =
    condition.field === 'from'
      ? candidate.from
      : condition.field === 'to'
        ? candidate.to
        : condition.field === 'subject'
          ? candidate.subject
          : candidate.body;

  const normalizedSource = normalizeText(source);
  const normalizedValue = normalizeText(condition.value);

  if (!normalizedValue) {
    return false;
  }

  if (condition.operator === 'equals') {
    return normalizedSource === normalizedValue;
  }

  if (condition.operator === 'starts-with') {
    return normalizedSource.startsWith(normalizedValue);
  }

  if (condition.operator === 'ends-with') {
    return normalizedSource.endsWith(normalizedValue);
  }

  return normalizedSource.includes(normalizedValue);
};

export const matchesMailRule = (candidate: MailRuleCandidate, rule: MailRule) => {
  if (!rule.enabled || !rule.conditions.length) {
    return false;
  }

  if (rule.mode === 'all') {
    return rule.conditions.every((condition) => conditionMatches(candidate, condition));
  }

  return rule.conditions.some((condition) => conditionMatches(candidate, condition));
};

export const createMailRuleCondition = (): MailRuleCondition => ({
  id: `rule_condition_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  field: 'from',
  operator: 'contains',
  value: ''
});

export const createMailRuleAction = (): MailRuleAction => ({
  id: `rule_action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  type: 'archive',
  value: ''
});
