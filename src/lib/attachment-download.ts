import type { AttachmentRecord } from '@lib/contracts';

type SaveDialogFilter = {
  name: string;
  extensions: string[];
};

type SaveDialogOptions = {
  defaultPath: string;
  filters: SaveDialogFilter[];
};

type AttachmentDownloadDependencies = {
  saveAttachmentFile: (localPath: string, savePath: string) => Promise<void>;
  showSaveDialog: (options: SaveDialogOptions) => Promise<string | null>;
};

export type AttachmentDownloadResult = 'saved' | 'cancelled' | 'missing-local-file';

const getFileExtension = (filename: string) => {
  const extension = filename.split('.').pop();
  return extension && extension !== filename ? extension.toLowerCase() : null;
};

const getDialogFilters = (attachment: AttachmentRecord): SaveDialogFilter[] => {
  const extension = getFileExtension(attachment.filename);
  if (!extension) {
    return [];
  }

  return [
    {
      name: extension.toUpperCase(),
      extensions: [extension]
    }
  ];
};

export const downloadAttachment = async (
  attachment: AttachmentRecord,
  { saveAttachmentFile, showSaveDialog }: AttachmentDownloadDependencies
): Promise<AttachmentDownloadResult> => {
  if (!attachment.local_path) {
    return 'missing-local-file';
  }

  const savePath = await showSaveDialog({
    defaultPath: attachment.filename,
    filters: getDialogFilters(attachment)
  });

  if (!savePath) {
    return 'cancelled';
  }

  await saveAttachmentFile(attachment.local_path, savePath);
  return 'saved';
};
