import { useRef } from 'react';
import { FileImage, FileText, Paperclip } from 'lucide-react';
import type { ComposerAttachment } from '@components/composer/Composer';

type ComposerAttachmentsProps = {
  attachments: ComposerAttachment[];
  onAdd: (files: File[]) => void;
  onRemove: (attachmentId: string) => void;
};

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

  return (
    <section
      aria-label="Attachments"
      className="composer-attachments"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onAdd(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="composer-attachments-header">
        <strong>Attachments</strong>
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
        <p className="composer-attachments-empty">Drop files here or use Attach file.</p>
      )}
    </section>
  );
};
