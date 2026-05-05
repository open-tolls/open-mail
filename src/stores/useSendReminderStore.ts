import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SendReminderStatus = 'active' | 'triggered' | 'replied' | 'cancelled';

export type SendReminderRecord = {
  id: string;
  accountId: string;
  threadId: string;
  subject: string;
  recipients: string[];
  remindAt: string;
  createdAt: string;
  status: SendReminderStatus;
};

type SendReminderState = {
  reminders: SendReminderRecord[];
  createReminder: (reminder: Omit<SendReminderRecord, 'id' | 'createdAt' | 'status'>) => string;
  cancelReminders: (reminderIds: string[]) => void;
};

const createReminderId = () => `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useSendReminderStore = create<SendReminderState>()(
  persist(
    (set) => ({
      reminders: [],
      createReminder: (reminder) => {
        const id = createReminderId();
        const createdAt = new Date().toISOString();

        set((state) => ({
          reminders: [
            {
              ...reminder,
              id,
              createdAt,
              status: 'active'
            },
            ...state.reminders
          ]
        }));

        return id;
      },
      cancelReminders: (reminderIds) =>
        set((state) => ({
          reminders: state.reminders.map((reminder) =>
            reminderIds.includes(reminder.id)
              ? {
                  ...reminder,
                  status: 'cancelled'
                }
              : reminder
          )
        }))
    }),
    {
      name: 'open-mail-send-reminders'
    }
  )
);
