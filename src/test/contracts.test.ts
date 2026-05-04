import { describe, expect, it } from 'vitest';
import type {
  BuildOAuthAuthorizationUrlRequest,
  AppConfig,
  ConnectionSettings,
  CompleteOAuthAccountRequest,
  DomainEvent,
  EnqueueOutboxMessageRequest,
  MailboxReadModel,
  OAuthAuthorizationRequest,
  OutboxMessage,
  OutboxSendReport,
  SyncStatusDetail
} from '@lib/contracts';

describe('contracts', () => {
  it('supports mailbox read models for future IPC hydration', () => {
    const mailbox: MailboxReadModel = {
      accountId: 'acc_1',
      activeFolder: 'fld_inbox',
      syncState: { kind: 'running' },
      folders: [],
      allThreads: [],
      threads: [
        {
          id: 'thr_1',
          subject: 'Subject',
          snippet: 'Preview',
          participants: ['hello@example.com'],
          isUnread: true,
          isStarred: false,
          hasAttachments: false,
          messageCount: 1,
          lastMessageAt: '2026-03-13T10:00:00Z'
        }
      ]
    };

    expect(mailbox.threads).toHaveLength(1);
    expect(mailbox.allThreads).toHaveLength(0);
  });

  it('covers domain events consumed by the frontend shell', () => {
    const event: DomainEvent = {
      type: 'sync-status-changed',
      accountId: 'acc_1',
      state: { kind: 'sleeping' }
    };

    expect(event.type).toBe('sync-status-changed');
  });

  it('supports detailed sync snapshots for the phase 2 shell', () => {
    const status: SyncStatusDetail = {
      state: { kind: 'sleeping' },
      phase: 'idling',
      folders: [
        {
          path: 'INBOX',
          displayName: 'Inbox',
          unreadCount: 2,
          totalCount: 12,
          envelopesDiscovered: 1,
          messagesApplied: 1
        }
      ],
      foldersSynced: 1,
      messagesObserved: 3,
      messagesFlagged: 1,
      messagesDeleted: 1,
      lastSyncStartedAt: '2026-03-13T10:00:00Z',
      lastSyncFinishedAt: '2026-03-13T10:00:25Z',
      lastError: null
    };

    expect(status.phase).toBe('idling');
    expect(status.folders[0]?.displayName).toBe('Inbox');
    expect(status.folders[0]?.messagesApplied).toBe(1);
    expect(status.messagesDeleted).toBe(1);
  });

  it('supports outbox enqueue contracts for smtp phase 2', () => {
    const request: EnqueueOutboxMessageRequest = {
      accountId: 'acc_demo',
      from: { name: null, email: 'leco@example.com' },
      to: [{ name: 'Team', email: 'team@example.com' }],
      cc: [],
      bcc: [],
      replyTo: null,
      subject: 'Desktop alpha',
      htmlBody: '<p>Ready</p>',
      plainBody: 'Ready',
      inReplyTo: null,
      references: [],
      attachments: []
    };
    const queued: OutboxMessage = {
      id: 'out_1',
      accountId: request.accountId,
      mimeMessage: request,
      status: 'queued',
      retryCount: 0,
      lastError: null,
      queuedAt: '2026-03-13T10:00:00Z',
      updatedAt: '2026-03-13T10:00:00Z'
    };

    expect(queued.mimeMessage.to[0]?.email).toBe('team@example.com');
    expect(queued.status).toBe('queued');
  });

  it('supports outbox send reports for smtp phase 2', () => {
    const report: OutboxSendReport = {
      accountId: 'acc_demo',
      attempted: 2,
      sent: 1,
      failed: 1
    };

    expect(report.attempted).toBe(report.sent + report.failed);
  });

  it('supports oauth authorization requests for phase 2 onboarding', () => {
    const request: BuildOAuthAuthorizationUrlRequest = {
      provider: 'Gmail',
      clientId: 'gmail-client',
      redirectUri: 'openmail://oauth/callback',
      state: 'csrf-state',
      codeChallenge: 'challenge-value'
    };
    const authorization: OAuthAuthorizationRequest = {
      provider: request.provider,
      authorizationUrl:
        'https://accounts.google.com/o/oauth2/v2/auth?state=csrf-state',
      state: request.state ?? '',
      scopes: ['https://mail.google.com/'],
      redirectUri: request.redirectUri
    };

    expect(authorization.provider).toBe('Gmail');
    expect(authorization.scopes).toContain('https://mail.google.com/');
  });

  it('supports oauth account completion requests for phase 6 onboarding', () => {
    const request: CompleteOAuthAccountRequest = {
      provider: 'Outlook',
      clientId: 'outlook-client',
      redirectUri: 'openmail://oauth/callback',
      authorizationCode: 'returned-code',
      email: 'outlook@example.com',
      name: 'Outlook User'
    };

    expect(request.authorizationCode).toBe('returned-code');
    expect(request.provider).toBe('Outlook');
  });

  it('supports autodiscovered connection settings for common providers', () => {
    const settings: ConnectionSettings = {
      imapHost: 'imap.fastmail.com',
      imapPort: 993,
      imapSecurity: 'Ssl',
      smtpHost: 'smtp.fastmail.com',
      smtpPort: 465,
      smtpSecurity: 'Ssl'
    };

    expect(settings.imapHost).toContain('fastmail');
    expect(settings.smtpSecurity).toBe('Ssl');
  });

  it('supports desktop preferences config contracts for phase 6', () => {
    const config: AppConfig = {
      language: 'Portuguese',
      defaultAccountId: 'acc_demo',
      markAsReadOnOpen: true,
      showSnippets: true,
      autoLoadImages: false,
      includeSignatureInReplies: true,
      requestReadReceipts: false,
      undoSendDelaySeconds: 5,
      launchAtLogin: true,
      checkForUpdates: true,
      minimizeToTray: false,
      theme: 'system',
      fontSize: 16,
      layoutMode: 'split',
      density: 'comfortable',
      threadPanelWidth: 58,
      notificationsEnabled: true,
      notificationSound: true,
      notificationScope: 'inbox',
      quietHoursStart: '',
      quietHoursEnd: '',
      developerToolsEnabled: false,
      logLevel: 'info'
    };

    expect(config.theme).toBe('system');
    expect(config.threadPanelWidth).toBeGreaterThan(40);
  });
});
