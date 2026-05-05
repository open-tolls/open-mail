import type { AttachmentRecord } from '@lib/contracts';
import type { MimeAttachment } from '@lib/contracts';

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

export type ComposerScheduledAttachment = {
  id: string;
  kind: 'scheduled';
  name: string;
  size: number;
  contentType: string;
  data: number[];
  contentId: string | null;
  isInline: boolean;
};

export type ComposerAttachment =
  | ComposerFileAttachment
  | ComposerForwardedAttachment
  | ComposerScheduledAttachment;

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

export const toComposerScheduledAttachment = (
  attachment: MimeAttachment,
  index: number
): ComposerScheduledAttachment => ({
  id: `scheduled-${attachment.filename}-${index}`,
  kind: 'scheduled',
  name: attachment.filename,
  size: attachment.data.length,
  contentType: attachment.contentType,
  data: attachment.data,
  contentId: attachment.contentId,
  isInline: attachment.isInline
});
