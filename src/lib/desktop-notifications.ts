import type { FolderRecord, MessageRecord, NotificationScope } from '@lib/contracts';

export type DesktopNotificationTarget = {
  accountId: string;
  threadId: string;
  folderId: string;
  folderRole: string | null;
};

export const isWithinQuietHours = (
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string
) => {
  if (!quietHoursStart || !quietHoursEnd) {
    return false;
  }

  const [startHour, startMinute] = quietHoursStart.split(':').map(Number);
  const [endHour, endMinute] = quietHoursEnd.split(':').map(Number);

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

export const shouldNotifyMessage = (
  message: MessageRecord,
  folders: FolderRecord[],
  scope: NotificationScope
) => {
  if (!message.is_unread || message.is_draft) {
    return false;
  }

  if (scope === 'all') {
    return true;
  }

  return folders.some(
    (folder) => folder.id === message.folder_id && folder.role?.toLowerCase() === 'inbox'
  );
};

export const toNotificationTitle = (message: MessageRecord) =>
  message.from[0]?.name?.trim() || message.from[0]?.email || 'Unknown sender';

export const toNotificationBody = (message: MessageRecord) =>
  message.snippet.trim() || message.subject.trim() || 'New message';

export const toNotificationTarget = (
  message: MessageRecord,
  folders: FolderRecord[]
): DesktopNotificationTarget => {
  const folder = folders.find((candidate) => candidate.id === message.folder_id) ?? null;

  return {
    accountId: message.account_id,
    threadId: message.thread_id,
    folderId: message.folder_id,
    folderRole: folder?.role ?? null
  };
};

export const readNotificationTarget = (extra: Record<string, unknown>): DesktopNotificationTarget | null => {
  const accountId = typeof extra.accountId === 'string' ? extra.accountId : null;
  const threadId = typeof extra.threadId === 'string' ? extra.threadId : null;
  const folderId = typeof extra.folderId === 'string' ? extra.folderId : null;
  const folderRole = typeof extra.folderRole === 'string' ? extra.folderRole : null;

  if (!accountId || !threadId || !folderId) {
    return null;
  }

  return {
    accountId,
    threadId,
    folderId,
    folderRole
  };
};

export const toNotificationRouteSegment = (target: DesktopNotificationTarget) =>
  target.folderRole?.toLowerCase() || target.folderId;
