import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageList } from '@components/message-list/MessageList';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import type { AttachmentRecord, ContactRecord, MessageRecord } from '@lib/contracts';

const contact = (id: string, email: string, name: string | null = null): ContactRecord => ({
  id,
  account_id: 'acc_demo',
  name,
  email,
  is_me: false,
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z'
});

const makeMessage = (overrides: Partial<MessageRecord>): MessageRecord => ({
  id: overrides.id ?? 'msg_1',
  account_id: 'acc_demo',
  thread_id: 'thr_1',
  from: [contact('ct_sender', 'sender@example.com', 'Sender Example')],
  to: [contact('ct_to', 'receiver@example.com', 'Receiver Example')],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: 'Thread subject',
  snippet: 'Default snippet',
  body: '<p>Default body</p>',
  plain_text: 'Default body',
  message_id_header: '<msg@openmail.dev>',
  in_reply_to: null,
  references: [],
  folder_id: 'fld_inbox',
  label_ids: [],
  is_unread: false,
  is_starred: false,
  is_draft: false,
  date: '2026-03-13T10:00:00Z',
  attachments: [],
  headers: {},
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z',
  ...overrides
});

const makeAttachment = (overrides: Partial<AttachmentRecord>): AttachmentRecord => ({
  id: overrides.id ?? 'att_inline_logo',
  message_id: overrides.message_id ?? 'msg_1',
  filename: overrides.filename ?? 'logo.png',
  content_type: overrides.content_type ?? 'image/png',
  size: overrides.size ?? 2048,
  content_id: overrides.content_id ?? 'logo@openmail.dev',
  is_inline: overrides.is_inline ?? true,
  local_path: overrides.local_path ?? '/tmp/open-mail/logo.png',
  ...overrides
});

const contacts: ContactDirectoryEntry[] = [
  {
    id: 'ct_sender',
    accountId: 'acc_demo',
    email: 'sender@example.com',
    name: 'Sender Example',
    isMe: false,
    emailCount: 2,
    lastEmailedAt: '2026-03-13T10:00:00Z',
    threads: [
      {
        threadId: 'thr_1',
        subject: 'Thread subject',
        lastMessageAt: '2026-03-13T10:00:00Z'
      }
    ]
  }
];

describe('MessageList', () => {
  it('renders chronological messages with the latest expanded by default', () => {
    const onSelectMessage = vi.fn();
    const messages = [
      makeMessage({
        id: 'msg_latest',
        body: '<p>Latest message</p><script>alert("xss")</script><img src="https://tracker.example/pixel.png" onerror="alert(1)" />',
        date: '2026-03-13T11:00:00Z',
        snippet: 'Latest snippet'
      }),
      makeMessage({
        id: 'msg_first',
        body: '<p>First message</p>',
        date: '2026-03-13T09:00:00Z',
        snippet: 'First snippet'
      })
    ];

    render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_latest"
        threadSubject="Thread subject"
        onSelectMessage={onSelectMessage}
      />
    );

    const messageItems = screen.getAllByRole('article');
    expect(within(messageItems[0]).getByText('First snippet')).toBeInTheDocument();
    expect(within(messageItems[1]).getByText('Latest message')).toBeInTheDocument();
    expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    fireEvent.click(within(messageItems[0]).getByRole('button', { name: /expand message/i }));

    expect(onSelectMessage).toHaveBeenCalledWith('msg_first');
    expect(screen.getByText('First message')).toBeInTheDocument();
  });

  it('shows a contact card from the message header on hover', async () => {
    render(
      <MessageList
        contacts={contacts}
        messages={[makeMessage({ id: 'msg_hover' })]}
        selectedMessageId="msg_hover"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
      />
    );

    fireEvent.mouseEnter(screen.getByText('Sender Example'));

    expect(await screen.findByLabelText('Contact card for sender@example.com')).toBeInTheDocument();
    expect(screen.getByText('Recent threads')).toBeInTheDocument();
  });

  it('opens sanitized links externally and loads remote images on demand', () => {
    const onOpenExternalLink = vi.fn();
    const messages = [
      makeMessage({
        id: 'msg_with_links',
        body: [
          '<p><a href="https://example.com/report">Open report</a></p>',
          '<img src="https://cdn.example.com/chart.png" alt="Report chart" />',
          '<img src="https://tracker.example.com/pixel.gif" width="1" height="1" alt="tracking pixel" />'
        ].join(''),
        date: '2026-03-13T11:00:00Z'
      })
    ];

    render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_with_links"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
        onOpenExternalLink={onOpenExternalLink}
      />
    );

    fireEvent.click(screen.getByRole('link', { name: 'Open report' }));

    expect(onOpenExternalLink).toHaveBeenCalledWith('https://example.com/report');
    expect(screen.queryByRole('img', { name: 'Report chart' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /load remote images/i }));

    expect(screen.getByRole('img', { name: 'Report chart' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/chart.png'
    );
    expect(screen.queryByRole('img', { name: 'tracking pixel' })).not.toBeInTheDocument();
  });

  it('renders inline CID images from matching inline attachments', () => {
    const messages = [
      makeMessage({
        id: 'msg_with_inline_image',
        body: '<p>Brand asset</p><img src="cid:logo@openmail.dev" alt="Open Mail logo" />',
        attachments: [
          makeAttachment({
            message_id: 'msg_with_inline_image',
            content_id: '<logo@openmail.dev>',
            local_path: '/tmp/open-mail/inline-logo.png'
          })
        ]
      })
    ];

    render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_with_inline_image"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
      />
    );

    expect(screen.getByRole('img', { name: 'Open Mail logo' })).toHaveAttribute(
      'src',
      '/tmp/open-mail/inline-logo.png'
    );
    expect(screen.queryByRole('button', { name: /load remote images/i })).not.toBeInTheDocument();
  });

  it('formats plain text messages with escaped markup and safe links', () => {
    const onOpenExternalLink = vi.fn();
    const messages = [
      makeMessage({
        id: 'msg_plain_text',
        body: '',
        plain_text: [
          'Hello team,',
          'This stays on the next line.',
          '',
          'Read more at https://example.com/docs',
          '<strong>literal markup</strong>'
        ].join('\n')
      })
    ];

    const { container } = render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_plain_text"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
        onOpenExternalLink={onOpenExternalLink}
      />
    );

    const messageBody = container.querySelector('.message-body-content');
    expect(messageBody).toHaveTextContent('Hello team,');
    expect(messageBody).toHaveTextContent('This stays on the next line.');
    expect(messageBody).toHaveTextContent('<strong>literal markup</strong>');
    expect(messageBody?.innerHTML).toContain('Hello team,<br>');

    fireEvent.click(screen.getByRole('link', { name: 'https://example.com/docs' }));

    expect(onOpenExternalLink).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('renders layout tables while stripping unsafe inline CSS', () => {
    const messages = [
      makeMessage({
        id: 'msg_layout_table',
        body: [
          '<table width="100%" cellpadding="8" cellspacing="0" style="position: fixed; width: 100%; border-collapse: collapse;">',
          '<tbody><tr>',
          '<td style="color: red; position: absolute; background-image: url(javascript:alert(1));">Layout cell</td>',
          '</tr></tbody>',
          '</table>'
        ].join('')
      })
    ];

    const { container } = render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_layout_table"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
      />
    );

    const table = container.querySelector('table');
    const cell = screen.getByText('Layout cell');

    expect(table).toHaveClass('message-layout-table');
    expect(table).toHaveAttribute('width', '100%');
    expect(table).toHaveAttribute('cellpadding', '8');
    expect(table?.getAttribute('style')).toBe('width: 100%; border-collapse: collapse;');
    expect(cell.getAttribute('style')).toBe('color: red;');
  });

  it('previews local image attachments and exposes download actions', () => {
    const onDownloadAttachment = vi.fn();
    const messages = [
      makeMessage({
        id: 'msg_with_attachment',
        attachments: [
          makeAttachment({
            id: 'att_receipt',
            message_id: 'msg_with_attachment',
            filename: 'receipt.png',
            content_type: 'image/png',
            is_inline: false,
            local_path: '/tmp/open-mail/receipt.png',
            size: 4096
          })
        ]
      })
    ];

    render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_with_attachment"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
        onDownloadAttachment={onDownloadAttachment}
        resolveInlineImageUrl={(localPath) => `asset://${localPath}`}
      />
    );

    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('receipt.png')).toBeInTheDocument();
    expect(screen.getByText('image/png · 4 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /preview receipt\.png/i }));

    expect(screen.getByRole('img', { name: 'Preview of receipt.png' })).toHaveAttribute(
      'src',
      'asset:///tmp/open-mail/receipt.png'
    );

    fireEvent.click(screen.getByRole('button', { name: /download receipt\.png/i }));

    expect(onDownloadAttachment).toHaveBeenCalledWith(expect.objectContaining({ id: 'att_receipt' }));
  });

  it('previews local PDF attachments in an inline frame', () => {
    const messages = [
      makeMessage({
        id: 'msg_with_pdf',
        attachments: [
          makeAttachment({
            id: 'att_pdf_report',
            message_id: 'msg_with_pdf',
            filename: 'report.pdf',
            content_type: 'application/pdf',
            content_id: null,
            is_inline: false,
            local_path: '/tmp/open-mail/report.pdf',
            size: 1048576
          })
        ]
      })
    ];

    render(
      <MessageList
        messages={messages}
        selectedMessageId="msg_with_pdf"
        threadSubject="Thread subject"
        onSelectMessage={vi.fn()}
        resolveInlineImageUrl={(localPath) => `asset://${localPath}`}
      />
    );

    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('application/pdf · 1.0 MB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /preview report\.pdf/i }));

    expect(screen.getByTitle('Preview of report.pdf')).toHaveAttribute(
      'src',
      'asset:///tmp/open-mail/report.pdf'
    );
  });
});
