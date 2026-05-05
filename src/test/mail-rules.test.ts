import { describe, expect, it } from 'vitest';
import {
  createMailRuleAction,
  createMailRuleCondition,
  matchesMailRule,
  type MailRule
} from '@lib/mail-rules';

const baseRule = (): MailRule => ({
  id: 'rule_1',
  accountId: null,
  name: 'Newsletter',
  enabled: true,
  mode: 'all',
  conditions: [
    {
      ...createMailRuleCondition(),
      field: 'from',
      operator: 'contains',
      value: 'newsletter'
    }
  ],
  actions: [
    {
      ...createMailRuleAction(),
      type: 'archive',
      value: ''
    }
  ]
});

describe('mail rules', () => {
  it('matches ALL conditions when all of them are true', () => {
    const rule: MailRule = {
      ...baseRule(),
      conditions: [
        {
          ...createMailRuleCondition(),
          field: 'from',
          operator: 'contains',
          value: 'newsletter'
        },
        {
          ...createMailRuleCondition(),
          field: 'subject',
          operator: 'starts-with',
          value: 'weekly'
        }
      ]
    };

    expect(
      matchesMailRule(
        {
          from: 'updates@newsletter.dev',
          to: 'leco@example.com',
          subject: 'Weekly platform digest',
          body: 'Body',
          hasAttachment: false
        },
        rule
      )
    ).toBe(true);
  });

  it('matches ANY mode when one condition succeeds', () => {
    const rule: MailRule = {
      ...baseRule(),
      mode: 'any',
      conditions: [
        {
          ...createMailRuleCondition(),
          field: 'subject',
          operator: 'contains',
          value: 'urgent'
        },
        {
          ...createMailRuleCondition(),
          field: 'has-attachment',
          operator: 'equals',
          value: 'true'
        }
      ]
    };

    expect(
      matchesMailRule(
        {
          from: 'boss@example.com',
          to: 'leco@example.com',
          subject: 'Roadmap',
          body: 'Attached file',
          hasAttachment: true
        },
        rule
      )
    ).toBe(true);
  });

  it('returns false for disabled or non-matching rules', () => {
    expect(
      matchesMailRule(
        {
          from: 'hello@example.com',
          to: 'leco@example.com',
          subject: 'Hello',
          body: 'Welcome',
          hasAttachment: false
        },
        {
          ...baseRule(),
          enabled: false
        }
      )
    ).toBe(false);

    expect(
      matchesMailRule(
        {
          from: 'hello@example.com',
          to: 'leco@example.com',
          subject: 'Hello',
          body: 'Welcome',
          hasAttachment: false
        },
        baseRule()
      )
    ).toBe(false);
  });
});
