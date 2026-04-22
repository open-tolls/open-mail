import type { MessageRecord } from '@lib/contracts';

type AutoMarkVisibleMessagesReadOptions = {
  isDesktopRuntime: boolean;
  markRead: (messageIds: string[]) => Promise<string[]>;
};

export const autoMarkVisibleMessagesRead = async (
  messages: MessageRecord[],
  { isDesktopRuntime, markRead }: AutoMarkVisibleMessagesReadOptions
) => {
  if (!isDesktopRuntime) {
    return [];
  }

  const unreadMessageIds = messages.filter((message) => message.is_unread).map((message) => message.id);
  if (!unreadMessageIds.length) {
    return [];
  }

  return markRead(unreadMessageIds);
};
