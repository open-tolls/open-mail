import type { ThreadSummary } from '@lib/contracts';

export const THREAD_ROW_HEIGHT = 132;

export type ThreadFilter = 'all' | 'unread' | 'starred' | 'attachments';

export const formatThreadTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Agora';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (diffMinutes >= 0 && diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)}m`;
  }

  if (isToday) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short'
  }).format(date);
};

export const getThreadLabels = (thread: ThreadSummary) => {
  const text = `${thread.subject} ${thread.snippet} ${thread.participants.join(' ')}`.toLowerCase();
  const labels: string[] = [];

  if (text.includes('design') || text.includes('motion')) {
    labels.push('design-review');
  }

  if (text.includes('alpha') || text.includes('ship') || text.includes('release')) {
    labels.push('desktop-alpha');
  }

  if (text.includes('rust') || text.includes('tauri')) {
    labels.push('tauri-health');
  }

  if (thread.hasAttachments) {
    labels.push('attachment');
  }

  return labels.slice(0, 3);
};

export const getSenderInitials = (thread: ThreadSummary) => {
  const sender = thread.participants[0] ?? 'Open Mail';
  const [first = 'O', second = 'M'] = sender
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase());

  return `${first}${second ?? ''}`.slice(0, 2);
};

export const filterThreads = (threads: ThreadSummary[], filter: ThreadFilter) => {
  switch (filter) {
    case 'attachments':
      return threads.filter((thread) => thread.hasAttachments);
    case 'starred':
      return threads.filter((thread) => thread.isStarred);
    case 'unread':
      return threads.filter((thread) => thread.isUnread);
    case 'all':
    default:
      return threads;
  }
};
