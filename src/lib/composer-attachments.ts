import type { AttachmentRecord } from '@lib/contracts';

export type ComposerFileAttachment = {
  id: string;
  kind: 'file';
  name: string;
  size: number;
  contentType: string;
  file: File;
};

export type ComposerForwardedAttachment = {
  id: string;
  kind: 'forwarded';
  name: string;
  size: number;
  contentType: string;
  localPath: string | null;
  contentId: string | null;
  isInline: boolean;
};

export type ComposerAttachment = ComposerFileAttachment | ComposerForwardedAttachment;

export const toComposerFileAttachment = (file: File): ComposerFileAttachment => ({
  id: `${file.name}-${file.size}-${file.lastModified}`,
  kind: 'file',
  name: file.name,
  size: file.size,
  contentType: file.type || 'application/octet-stream',
  file
});

export const toComposerForwardedAttachment = (attachment: AttachmentRecord): ComposerForwardedAttachment => ({
  id: attachment.id,
  kind: 'forwarded',
  name: attachment.filename,
  size: attachment.size,
  contentType: attachment.content_type,
  localPath: attachment.local_path,
  contentId: attachment.content_id,
  isInline: attachment.is_inline
});
