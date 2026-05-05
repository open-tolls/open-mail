import { describe, expect, it } from 'vitest';
import { applyTemplateVariables, extractTemplateVariables } from '@lib/template-utils';

describe('template utils', () => {
  it('extracts unique variables from subject and body', () => {
    expect(
      extractTemplateVariables(
        'Following up with {{name}}',
        '<p>Hello {{ name }}, welcome to {{company}}.</p><p>{{company}}</p>'
      )
    ).toEqual(['name', 'company']);
  });

  it('replaces template variables with provided values', () => {
    expect(
      applyTemplateVariables('<p>Hello {{name}} from {{company}}</p>', {
        name: 'Leco',
        company: 'Open Mail'
      })
    ).toBe('<p>Hello Leco from Open Mail</p>');
  });
});
