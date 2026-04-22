import { describe, expect, it, vi } from 'vitest';
import type { AttachmentRecord } from '@lib/contracts';
import { downloadAttachment } from '@lib/attachment-download';

const attachment = (overrides: Partial<AttachmentRecord> = {}): AttachmentRecord => ({
  id: 'att_report',
  message_id: 'msg_1',
  filename: 'report.pdf',
  content_type: 'application/pdf',
  size: 2048,
  content_id: null,
  is_inline: false,
  local_path: '/tmp/open-mail/report.pdf',
  ...overrides
});

describe('downloadAttachment', () => {
  it('opens a save dialog with the attachment filename and copies the local file to the selected path', async () => {
    const showSaveDialog = vi.fn().mockResolvedValue('/Users/leco/Downloads/report.pdf');
    const saveAttachmentFile = vi.fn().mockResolvedValue(undefined);

    const result = await downloadAttachment(attachment(), {
      saveAttachmentFile,
      showSaveDialog
    });

    expect(result).toBe('saved');
    expect(showSaveDialog).toHaveBeenCalledWith({
      defaultPath: 'report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    expect(saveAttachmentFile).toHaveBeenCalledWith(
      '/tmp/open-mail/report.pdf',
      '/Users/leco/Downloads/report.pdf'
    );
  });

  it('does not copy when the save dialog is cancelled', async () => {
    const showSaveDialog = vi.fn().mockResolvedValue(null);
    const saveAttachmentFile = vi.fn();

    const result = await downloadAttachment(attachment(), {
      saveAttachmentFile,
      showSaveDialog
    });

    expect(result).toBe('cancelled');
    expect(saveAttachmentFile).not.toHaveBeenCalled();
  });

  it('does not open a dialog for attachments without a local file', async () => {
    const showSaveDialog = vi.fn();
    const saveAttachmentFile = vi.fn();

    const result = await downloadAttachment(attachment({ local_path: null }), {
      saveAttachmentFile,
      showSaveDialog
    });

    expect(result).toBe('missing-local-file');
    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(saveAttachmentFile).not.toHaveBeenCalled();
  });
});
