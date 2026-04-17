import { create } from 'zustand';
import type { MessageRecord } from '@lib/contracts';

type MessageState = {
  messagesByThreadId: Record<string, MessageRecord[]>;
  selectedMessageId: string | null;
  setThreadMessages: (threadId: string, messages: MessageRecord[]) => void;
  selectMessage: (messageId: string | null) => void;
  clearMessages: () => void;
};

export const useMessageStore = create<MessageState>((set) => ({
  messagesByThreadId: {},
  selectedMessageId: null,
  setThreadMessages: (threadId, messages) =>
    set((state) => ({
      messagesByThreadId: {
        ...state.messagesByThreadId,
        [threadId]: messages
      },
      selectedMessageId:
        state.selectedMessageId && messages.some((message) => message.id === state.selectedMessageId)
          ? state.selectedMessageId
          : messages[0]?.id ?? null
    })),
  selectMessage: (selectedMessageId) => set({ selectedMessageId }),
  clearMessages: () => set({ messagesByThreadId: {}, selectedMessageId: null })
}));
