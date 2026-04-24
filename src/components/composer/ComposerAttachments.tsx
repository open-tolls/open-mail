import { useRef } from 'react';
import { FileImage, FileText, Paperclip } from 'lucide-react';
import type { ComposerAttachment } from '@components/composer/Composer';

type ComposerAttachmentsProps = {
  attachments: ComposerAttachment[];
  onAdd: (files: File[]) => void;
  onRemove: (attachmentId: string) => void;
};

const ATTACHMENT_SIZE_LIMIT_BYTES = 25 * 1024 * 1024;
const ATTACHMENT_WARNING_THRESHOLD_BYTES = 20 * 1024 * 1024;

const formatSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getAttachmentKind = (contentType: string) => {
  if (contentType.startsWith('image/')) {
    return {
      icon: FileImage,
      label: 'Image'
    };
  }

  if (contentType === 'application/pdf' || contentType.includes('pdf')) {
    return {
      icon: FileText,
      label: 'PDF'
    };
  }

  return {
    icon: Paperclip,
    label: 'File'
  };
};

export const ComposerAttachments = ({ attachments, onAdd, onRemove }: ComposerAttachmentsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalSize = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
  const isNearLimit = totalSize >= ATTACHMENT_WARNING_THRESHOLD_BYTES;
  const isOverLimit = totalSize > ATTACHMENT_SIZE_LIMIT_BYTES;

  return (
    <section
      aria-label="Attachments"
      className={[
        'composer-attachments',
        isOverLimit ? 'composer-attachments-over-limit' : isNearLimit ? 'composer-attachments-warning' : ''
      ].filter(Boolean).join(' ')}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onAdd(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const clipboardFiles = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);

        if (!clipboardFiles.length) {
          return;
        }

        event.preventDefault();
        onAdd(clipboardFiles);
      }}
    >
      <div className="composer-attachments-header">
        <div className="composer-attachments-heading">
          <strong>Attachments</strong>
          {attachments.length ? (
            <span aria-label="Attachment total size">
              {formatSize(totalSize)} of {formatSize(ATTACHMENT_SIZE_LIMIT_BYTES)}
            </span>
          ) : null}
        </div>
        <button onClick={() => fileInputRef.current?.click()} type="button">
          Attach file
        </button>
        <input
          aria-label="Attach files"
          hidden
          multiple
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            event.currentTarget.value = '';
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>
      {isOverLimit ? (
        <p className="composer-attachments-warning-text" role="alert">
          Attachments exceed the 25 MB limit. Remove a file before queueing.
        </p>
      ) : null}
      {!isOverLimit && isNearLimit ? (
        <p className="composer-attachments-warning-text" role="status">
          Attachments are close to the 25 MB limit.
        </p>
      ) : null}

      {attachments.length ? (
        <div className="composer-attachment-list">
          {attachments.map((attachment) => (
            <div className="composer-attachment-item" key={attachment.id}>
              <div
                aria-label={`${getAttachmentKind(attachment.contentType).label} attachment`}
                className="composer-attachment-icon"
              >
                {(() => {
                  const AttachmentIcon = getAttachmentKind(attachment.contentType).icon;
                  return <AttachmentIcon size={18} />;
                })()}
              </div>
              <div className="composer-attachment-copy">
                <strong>{attachment.name}</strong>
                <span>
                  {getAttachmentKind(attachment.contentType).label} · {formatSize(attachment.size)}
                </span>
              </div>
              <button aria-label={`Remove ${attachment.name}`} onClick={() => onRemove(attachment.id)} type="button">
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="composer-attachments-empty">Drop files here, paste an image, or use Attach file.</p>
      )}
    </section>
  );
};
