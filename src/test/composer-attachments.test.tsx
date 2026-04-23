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
        attachments={[{ file, id: 'report.pdf-1' }]}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove report.pdf' }));
    expect(onRemove).toHaveBeenCalledWith('report.pdf-1');
  });
});
