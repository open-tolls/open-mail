import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@components/composer/Composer';

describe('Composer send flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks queueing when there are no recipients', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{ attachments: [], bcc: [], body: '<p>Hello</p>', cc: [], subject: 'Review', to: [] }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Please add at least one recipient');
  });

  it('asks for confirmation before queueing without subject', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{ attachments: [], bcc: [], body: '<p>Hello</p>', cc: [], subject: '   ', to: ['atlas@example.com'] }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(confirmSpy).toHaveBeenCalledWith('Send without subject?');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Send canceled');
  });

  it('discards a dirty draft through the footer action', async () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <Composer
        from="leco@example.com"
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={onClose}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSend={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Updated subject' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Discard this draft?');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('queues through the Cmd+Enter shortcut', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{
          attachments: [],
          bcc: [],
          body: '<p>Hello</p>',
          cc: [],
          subject: 'Shortcut send',
          to: ['atlas@example.com']
        }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSend={onSend}
      />
    );

    fireEvent.keyDown(screen.getByRole('region', { name: /composer/i }), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalled();
    });
  });
});
