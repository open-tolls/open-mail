import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ParticipantField } from '@components/composer/ParticipantField';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';

const contacts: ContactDirectoryEntry[] = [
  {
    id: 'ct_infra',
    accountId: 'acc_demo',
    email: 'infra@example.com',
    name: 'Infra Sync',
    isMe: false,
    emailCount: 3,
    lastEmailedAt: '2026-03-13T09:28:00Z',
    threads: [
      {
        threadId: 'thr_2',
        subject: 'Rust health-check online',
        lastMessageAt: '2026-03-13T09:28:00Z'
      }
    ]
  }
];

describe('ParticipantField', () => {
  it('shows autocomplete suggestions and selects with Enter', () => {
    const onChange = vi.fn();

    render(
      <ParticipantField
        accountId="acc_demo"
        contacts={contacts}
        label="To"
        onChange={onChange}
        placeholder="Add recipients"
        suggestions={['infra@example.com', 'release@example.com']}
        value={[]}
      />
    );

    const input = screen.getByLabelText('To');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'inf' } });
    expect(screen.getByRole('option', { name: 'infra@example.com' })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['infra@example.com']);
  });

  it('creates multiple chips from paste and removes the last one with Backspace', () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <ParticipantField
        accountId="acc_demo"
        contacts={contacts}
        label="Cc"
        onChange={onChange}
        placeholder="Add Cc recipients"
        suggestions={[]}
        value={[]}
      />
    );

    const input = screen.getByLabelText('Cc');
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => 'alice@example.com,\nbob@example.com'
      }
    });
    expect(onChange).toHaveBeenCalledWith(['alice@example.com', 'bob@example.com']);

    rerender(
      <ParticipantField
        accountId="acc_demo"
        contacts={contacts}
        label="Cc"
        onChange={onChange}
        placeholder="Add Cc recipients"
        suggestions={[]}
        value={['alice@example.com', 'bob@example.com']}
      />
    );

    fireEvent.keyDown(screen.getByLabelText('Cc'), { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(['alice@example.com']);
  });

  it('marks invalid recipient chips visually', () => {
    render(
      <ParticipantField
        accountId="acc_demo"
        contacts={contacts}
        label="Bcc"
        onChange={() => undefined}
        placeholder="Add Bcc recipients"
        suggestions={[]}
        value={['invalid-email']}
      />
    );

    expect(screen.getByTitle('invalid-email')).toHaveClass('participant-chip-invalid');
  });

  it('shows a contact card when hovering a known participant chip', async () => {
    render(
      <ParticipantField
        accountId="acc_demo"
        contacts={contacts}
        label="To"
        onChange={() => undefined}
        placeholder="Add recipients"
        suggestions={[]}
        value={['infra@example.com']}
      />
    );

    fireEvent.mouseEnter(screen.getByText('infra@example.com'));

    expect(await screen.findByLabelText('Contact card for infra@example.com')).toBeInTheDocument();
    expect(screen.getByText('Infra Sync')).toBeInTheDocument();
  });
});
