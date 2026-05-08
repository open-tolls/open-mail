import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '@components/composer/Composer';
import { useTemplateStore } from '@stores/useTemplateStore';

describe('Composer send flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks queueing when there are no recipients', async () => {
    const onSend = vi.fn().mockResolvedValue(true);

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{ attachments: [], bcc: [], body: '<p>Hello</p>', cc: [], subject: 'Review', to: [] }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Please add at least one recipient');
  });

  it('asks for confirmation before queueing without subject', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
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
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(confirmSpy).toHaveBeenCalledWith('Send without subject?');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Send canceled');
  });

  it('discards a dirty draft through the footer action', async () => {
    const onDiscard = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <Composer
        from="leco@example.com"
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onDiscard={onDiscard}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Updated subject' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Discard this draft?');
      expect(onDiscard).toHaveBeenCalled();
    });
  });

  it('queues through the Cmd+Enter shortcut', async () => {
    const onSend = vi.fn().mockResolvedValue(true);

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
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={onSend}
      />
    );

    fireEvent.keyDown(screen.getByRole('region', { name: /composer/i }), { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalled();
    });
  });

  it('shows a loading spinner while queueing', () => {
    render(
      <Composer
        from="leco@example.com"
        isSending
        recipientSuggestions={[]}
        status="Queueing message..."
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    expect(screen.getByRole('button', { name: /queueing/i })).toBeDisabled();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('opens send later presets and schedules a draft', async () => {
    const onSchedule = vi.fn().mockResolvedValue(true);

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{
          attachments: [],
          bcc: [],
          body: '<p>Hello</p>',
          cc: [],
          subject: 'Schedule me',
          to: ['atlas@example.com']
        }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={onSchedule}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send later' }));
    expect(screen.getByRole('dialog', { name: 'Send later dialog' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow morning' }));

    await waitFor(() => {
      expect(onSchedule).toHaveBeenCalledTimes(1);
    });
    expect(onSchedule.mock.calls[0]?.[0].subject).toBe('Schedule me');
    expect(typeof onSchedule.mock.calls[0]?.[1]).toBe('string');
  });

  it('moves focus into send later dialog and closes it with Escape', () => {
    render(
      <Composer
        from="leco@example.com"
        initialDraft={{
          attachments: [],
          bcc: [],
          body: '<p>Hello</p>',
          cc: [],
          subject: 'Schedule me',
          to: ['atlas@example.com']
        }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send later' }));

    const closeButton = screen.getByRole('button', { name: 'Close send later dialog' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Send later dialog' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Send later dialog' })).not.toBeInTheDocument();
  });

  it('sets a follow-up reminder before queueing a draft', async () => {
    const onSend = vi.fn().mockResolvedValue(true);

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{
          attachments: [],
          bcc: [],
          body: '<p>Hello</p>',
          cc: [],
          subject: 'Reminder me',
          to: ['atlas@example.com']
        }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remind me' }));
    expect(screen.getByRole('dialog', { name: 'Send reminder dialog' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'In 3 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledTimes(1);
    });
    expect(onSend.mock.calls[0]?.[0].subject).toBe('Reminder me');
    expect(typeof onSend.mock.calls[0]?.[1]).toBe('string');
    expect(screen.getByRole('status')).toHaveTextContent('Follow-up reminder set');
  });

  it('applies a template with variables from the composer', async () => {
    useTemplateStore.setState({
      templates: [
        {
          id: 'tpl_followup',
          title: 'Follow-up template',
          accountId: null,
          subject: 'Follow-up for {{project}}',
          body: '<p>Hello {{name}},</p><p>Quick check-in.</p>',
          variables: ['project', 'name']
        }
      ]
    });

    render(
      <Composer
        from="leco@example.com"
        initialDraft={{
          attachments: [],
          bcc: [],
          body: '<p>Hello</p>',
          cc: [],
          subject: '',
          to: ['atlas@example.com']
        }}
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: /Follow-up template/i }));
    fireEvent.change(screen.getByPlaceholderText('Value for project'), { target: { value: 'Phase 7' } });
    fireEvent.change(screen.getByPlaceholderText('Value for name'), { target: { value: 'Atlas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply template' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^subject$/i)).toHaveValue('Follow-up for Phase 7');
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('Hello Atlas,');
    });
  });

  it('moves focus into the template picker and closes it with Escape', () => {
    useTemplateStore.setState({
      templates: [
        {
          id: 'tpl_followup',
          title: 'Follow-up template',
          accountId: null,
          subject: '',
          body: '<p>Hello</p>',
          variables: []
        }
      ]
    });

    render(
      <Composer
        from="leco@example.com"
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    const dialog = screen.getByRole('dialog', { name: 'Template picker' });
    const closeButton = screen.getByRole('button', { name: 'Close template picker' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Template picker' })).not.toBeInTheDocument();
  });

  it('moves focus into template variables dialog and closes it with Escape', () => {
    useTemplateStore.setState({
      templates: [
        {
          id: 'tpl_followup',
          title: 'Follow-up template',
          accountId: null,
          subject: 'Follow-up for {{project}}',
          body: '<p>Hello {{name}},</p><p>Quick check-in.</p>',
          variables: ['project', 'name']
        }
      ]
    });

    render(
      <Composer
        from="leco@example.com"
        isSending={false}
        recipientSuggestions={[]}
        status="Composer ready"
        onClose={() => undefined}
        onFlushOutbox={vi.fn().mockResolvedValue(undefined)}
        onSchedule={vi.fn().mockResolvedValue(true)}
        onSend={vi.fn().mockResolvedValue(true)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: /Follow-up template/i }));

    const dialog = screen.getByRole('dialog', { name: 'Template variables' });
    const closeButton = screen.getByRole('button', { name: 'Close template variables dialog' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Template variables' })).not.toBeInTheDocument();
  });
});
