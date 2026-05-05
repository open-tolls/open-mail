import type { MessageRecord } from '@lib/contracts';
import { formatAttachmentSize, formatContacts } from '@components/message-list/messageListUtils';

const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']);
const allowedLinkProtocols = new Set(['http:', 'https:', 'mailto:']);
const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => htmlEscapeMap[character] ?? character);

const formatPrintDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const getSafeUrl = (rawUrl: string) => {
  try {
    return new URL(rawUrl, window.location.href);
  } catch {
    return null;
  }
};

const linkifyPlainText = (text: string) =>
  escapeHtml(text).replace(/(https?:\/\/[^\s<]+|mailto:[^\s<]+)/gi, (match) => {
    const safeUrl = getSafeUrl(match);
    if (!safeUrl || !allowedLinkProtocols.has(safeUrl.protocol)) {
      return escapeHtml(match);
    }

    const href = escapeHtml(safeUrl.toString());
    return `<a href="${href}">${escapeHtml(match)}</a>`;
  });

const formatPlainTextAsHtml = (plainText: string) =>
  plainText
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => `<p>${paragraph.split('\n').map(linkifyPlainText).join('<br />')}</p>`)
    .join('');

const sanitizePrintableHtml = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('*').forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (blockedTags.has(tagName)) {
      element.remove();
      return;
    }

    [...element.attributes].forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim().toLowerCase();

      if (attributeName.startsWith('on') || attributeName === 'class' || attributeName === 'id') {
        element.removeAttribute(attribute.name);
        return;
      }

      if (attributeName === 'href') {
        const safeUrl = getSafeUrl(attribute.value);
        if (!safeUrl || !allowedLinkProtocols.has(safeUrl.protocol)) {
          element.removeAttribute(attribute.name);
          return;
        }

        element.setAttribute('href', safeUrl.toString());
        return;
      }

      if (attributeValue.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    });

    if (tagName === 'img') {
      element.remove();
    }
  });

  return template.innerHTML;
};

const buildPrintableBody = (message: MessageRecord) => {
  if (message.body.trim()) {
    return sanitizePrintableHtml(message.body);
  }

  return formatPlainTextAsHtml(message.plain_text ?? '');
};

export const buildPrintableMessageHtml = (message: MessageRecord) => {
  const attachmentList = message.attachments.length
    ? `
      <section class="print-section">
        <h2>Attachments</h2>
        <ul class="print-attachments">
          ${message.attachments
            .map(
              (attachment) =>
                `<li>${escapeHtml(attachment.filename)} <span>(${escapeHtml(formatAttachmentSize(attachment.size))})</span></li>`
            )
            .join('')}
        </ul>
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(message.subject || 'Message print')}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Georgia", "Times New Roman", serif;
      }
      body {
        margin: 0;
        background: #f4f1eb;
        color: #1f1b18;
      }
      main {
        box-sizing: border-box;
        max-width: 820px;
        margin: 0 auto;
        padding: 40px 32px 56px;
        background: #fffdfa;
        min-height: 100vh;
      }
      h1 {
        font-size: 28px;
        line-height: 1.2;
        margin: 0 0 24px;
      }
      h2 {
        font-size: 14px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 0 0 10px;
      }
      .print-header-grid {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 10px 16px;
        margin-bottom: 28px;
        font-family: "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
      }
      .print-label {
        color: #6e6256;
        font-weight: 600;
      }
      .print-body {
        border-top: 1px solid #ddd1c4;
        padding-top: 24px;
        font-size: 16px;
        line-height: 1.65;
      }
      .print-body p:first-child {
        margin-top: 0;
      }
      .print-body table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-body a {
        color: inherit;
        text-decoration: underline;
      }
      .print-section {
        border-top: 1px solid #ddd1c4;
        margin-top: 28px;
        padding-top: 24px;
        font-family: "Helvetica Neue", Arial, sans-serif;
      }
      .print-attachments {
        margin: 0;
        padding-left: 18px;
      }
      .print-attachments span {
        color: #6e6256;
      }
      @media print {
        body {
          background: #fff;
        }
        main {
          max-width: none;
          padding: 0;
          background: #fff;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(message.subject || '(No subject)')}</h1>
      <section class="print-header-grid" aria-label="Message headers">
        <span class="print-label">From</span>
        <span>${escapeHtml(formatContacts(message.from))}</span>
        <span class="print-label">To</span>
        <span>${escapeHtml(formatContacts(message.to))}</span>
        ${message.cc.length ? `<span class="print-label">Cc</span><span>${escapeHtml(formatContacts(message.cc))}</span>` : ''}
        <span class="print-label">Date</span>
        <span>${escapeHtml(formatPrintDate(message.date))}</span>
        <span class="print-label">Subject</span>
        <span>${escapeHtml(message.subject || '(No subject)')}</span>
      </section>
      <section class="print-body">${buildPrintableBody(message)}</section>
      ${attachmentList}
    </main>
  </body>
</html>`;
};

export const printMessage = (message: MessageRecord) => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintableMessageHtml(message));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();

  return true;
};
