import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import type { AttachmentRecord } from '@lib/contracts';
import { formatAttachmentSize } from '@components/message-list/messageListUtils';

type MessageAttachmentsProps = {
  attachments: AttachmentRecord[];
  onDownloadAttachment?: (attachment: AttachmentRecord) => void;
  resolveAttachmentUrl?: (localPath: string) => string;
};

const getAttachmentKind = (contentType: string) => {
  if (contentType.startsWith('image/')) {
    return 'Image';
  }

  if (contentType === 'application/pdf') {
    return 'PDF';
  }

  return 'File';
};

const resolveLocalAttachmentUrl = (localPath: string) => localPath;

export const MessageAttachments = ({
  attachments,
  onDownloadAttachment,
  resolveAttachmentUrl = resolveLocalAttachmentUrl
}: MessageAttachmentsProps) => {
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);

  if (!attachments.length) {
    return null;
  }

  return (
    <div className="message-attachments" aria-label="Message attachments">
      {attachments.map((attachment) => {
        const attachmentKind = getAttachmentKind(attachment.content_type);
        const canPreviewImage = attachmentKind === 'Image' && Boolean(attachment.local_path);
        const isPreviewVisible = previewAttachmentId === attachment.id && canPreviewImage;
        const AttachmentIcon = attachmentKind === 'Image' ? ImageIcon : attachmentKind === 'PDF' ? FileText : Paperclip;

        return (
          <div className="message-attachment-card" key={attachment.id}>
            <AttachmentIcon size={15} />
            <span>
              <strong>{attachment.filename}</strong>
              <small>{attachment.content_type} · {formatAttachmentSize(attachment.size)}</small>
              <em>{attachmentKind}</em>
            </span>
            <div className="message-attachment-actions">
              {canPreviewImage ? (
                <button
                  aria-label={`Preview ${attachment.filename}`}
                  onClick={() => setPreviewAttachmentId(isPreviewVisible ? null : attachment.id)}
                  type="button"
                >
                  Preview
                </button>
              ) : null}
              <button
                aria-label={`Download ${attachment.filename}`}
                onClick={() => onDownloadAttachment?.(attachment)}
                type="button"
              >
                <Download size={14} />
              </button>
            </div>
            {isPreviewVisible && attachment.local_path ? (
              <img
                alt={`Preview of ${attachment.filename}`}
                className="message-attachment-preview"
                src={resolveAttachmentUrl(attachment.local_path)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
