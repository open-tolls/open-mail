import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerAttachments } from '@components/composer/ComposerAttachments';

describe('ComposerAttachments', () => {
  it('adds files through the picker and removes them from the list', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });

    const { rerender } = render(<ComposerAttachments attachments={[]} onAdd={onAdd} onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    fireEvent.change(screen.getByLabelText('Attach files'), {
      target: { files: [file] }
    });
    expect(onAdd).toHaveBeenCalled();

    rerender(
      <ComposerAttachments
        attachments={[
          {
            id: 'report.pdf-1',
            kind: 'file',
            name: 'report.pdf',
            size: file.size,
            contentType: 'application/pdf',
            file
          }
        ]}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('PDF attachment')).toBeInTheDocument();
    expect(screen.getByText(/PDF ·/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
    expect(onRemove).toHaveBeenCalledWith('report.pdf-1');
  });

  it('shows total size warnings when attachments approach or exceed the limit', () => {
    const { rerender } = render(
      <ComposerAttachments
        attachments={[
          {
            id: 'warning-file',
            kind: 'forwarded',
            name: 'deck.pdf',
            size: 21 * 1024 * 1024,
            contentType: 'application/pdf',
            localPath: '/tmp/open-mail/deck.pdf',
            contentId: null,
            isInline: false
          }
        ]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Attachment total size')).toHaveTextContent('21.0 MB of 25.0 MB');
    expect(screen.getByRole('status')).toHaveTextContent('Attachments are close to the 25 MB limit.');

    rerender(
      <ComposerAttachments
        attachments={[
          {
            id: 'warning-file',
            kind: 'forwarded',
            name: 'deck.pdf',
            size: 21 * 1024 * 1024,
            contentType: 'application/pdf',
            localPath: '/tmp/open-mail/deck.pdf',
            contentId: null,
            isInline: false
          },
          {
            id: 'over-limit-file',
            kind: 'forwarded',
            name: 'video.mp4',
            size: 5 * 1024 * 1024,
            contentType: 'video/mp4',
            localPath: '/tmp/open-mail/video.mp4',
            contentId: null,
            isInline: false
          }
        ]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Attachment total size')).toHaveTextContent('26.0 MB of 25.0 MB');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Attachments exceed the 25 MB limit. Remove a file before queueing.'
    );
  });

  it('adds pasted clipboard images as attachments', () => {
    const onAdd = vi.fn();
    const imageFile = new File(['image-bytes'], 'clipboard.png', { type: 'image/png' });

    render(<ComposerAttachments attachments={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    fireEvent.paste(screen.getByLabelText('Attachments'), {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => imageFile
          }
        ]
      }
    });

    expect(onAdd).toHaveBeenCalledWith([imageFile]);
  });
});
