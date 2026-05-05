import type { MessageRecord } from '@lib/contracts';

export type PhishingReason =
  | {
      type: 'spoofed-sender';
      displayName: string;
      actualEmail: string;
    }
  | {
      type: 'mismatched-link';
      linkText: string;
      actualUrl: string;
    }
  | {
      type: 'reply-to-mismatch';
      from: string;
      replyTo: string;
    };

export type MessageSecurityAnalysis = {
  isSuspicious: boolean;
  reasons: PhishingReason[];
};

export type UnsubscribeInfo = {
  mailto: string | null;
  url: string | null;
  oneClick: boolean;
};

const knownBrands = [
  { brand: 'google', domains: ['google.com', 'googlemail.com'] },
  { brand: 'apple', domains: ['apple.com', 'icloud.com'] },
  { brand: 'microsoft', domains: ['microsoft.com', 'outlook.com', 'office.com'] },
  { brand: 'paypal', domains: ['paypal.com'] },
  { brand: 'amazon', domains: ['amazon.com'] }
];

const normalizeText = (value: string) => value.trim().toLowerCase();

const extractDomain = (value: string) => normalizeText(value.split('@')[1] ?? '');

const getSafeUrl = (rawUrl: string) => {
  try {
    return new URL(rawUrl, window.location.href);
  } catch {
    return null;
  }
};

const displayTextLooksLikeUrl = (value: string) =>
  /^(https?:\/\/|www\.)/i.test(value.trim()) || /^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(value.trim());

const sanitizeVisibleLinkText = (value: string) => value.replace(/\s+/g, ' ').trim();

const extractMismatchedLinks = (
  html: string
): Array<Extract<PhishingReason, { type: 'mismatched-link' }>> => {
  const template = document.createElement('template');
  template.innerHTML = html;

  return [...template.content.querySelectorAll('a[href]')]
    .map((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      const safeUrl = getSafeUrl(href);
      const linkText = sanitizeVisibleLinkText(anchor.textContent ?? '');

      if (!safeUrl || !linkText || !displayTextLooksLikeUrl(linkText)) {
        return null;
      }

      const textUrl = getSafeUrl(linkText.startsWith('http') ? linkText : `https://${linkText}`);
      if (!textUrl) {
        return null;
      }

      if (normalizeText(textUrl.hostname) === normalizeText(safeUrl.hostname)) {
        return null;
      }

      return {
        type: 'mismatched-link' as const,
        linkText,
        actualUrl: safeUrl.toString()
      };
    })
    .filter((reason): reason is Extract<PhishingReason, { type: 'mismatched-link' }> => Boolean(reason));
};

export const analyzeMessageSecurity = (message: MessageRecord): MessageSecurityAnalysis => {
  const reasons: PhishingReason[] = [];
  const primaryFrom = message.from[0];
  const primaryReplyTo = message.reply_to[0];

  if (primaryFrom?.name) {
    const normalizedName = normalizeText(primaryFrom.name);
    const emailDomain = extractDomain(primaryFrom.email);
    const spoofedBrand = knownBrands.find(
      ({ brand, domains }) =>
        normalizedName.includes(brand) && !domains.some((domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`))
    );

    if (spoofedBrand) {
      reasons.push({
        type: 'spoofed-sender',
        displayName: primaryFrom.name,
        actualEmail: primaryFrom.email
      });
    }
  }

  if (primaryFrom && primaryReplyTo && normalizeText(primaryFrom.email) !== normalizeText(primaryReplyTo.email)) {
    reasons.push({
      type: 'reply-to-mismatch',
      from: primaryFrom.email,
      replyTo: primaryReplyTo.email
    });
  }

  reasons.push(...extractMismatchedLinks(message.body));

  return {
    isSuspicious: reasons.length > 0,
    reasons
  };
};

const getHeaderValue = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(([key]) => normalizeText(key) === normalizeText(name))?.[1] ?? null;

export const extractUnsubscribeInfo = (headers: Record<string, string>): UnsubscribeInfo | null => {
  const unsubscribeHeader = getHeaderValue(headers, 'List-Unsubscribe');
  if (!unsubscribeHeader) {
    return null;
  }

  const candidates = [...unsubscribeHeader.matchAll(/<([^>]+)>/g)].map((match) => match[1].trim());
  const mailto = candidates.find((candidate) => candidate.toLowerCase().startsWith('mailto:')) ?? null;
  const url = candidates.find((candidate) => candidate.toLowerCase().startsWith('http')) ?? null;
  const unsubscribePostHeader = getHeaderValue(headers, 'List-Unsubscribe-Post');

  return {
    mailto,
    url,
    oneClick: Boolean(unsubscribePostHeader && normalizeText(unsubscribePostHeader).includes('list-unsubscribe=one-click'))
  };
};

export const getPhishingWarningCopy = (reason: PhishingReason) => {
  if (reason.type === 'spoofed-sender') {
    return `${reason.displayName} is using ${reason.actualEmail}, which does not match the expected sender domain.`;
  }

  if (reason.type === 'reply-to-mismatch') {
    return `Reply-To points to ${reason.replyTo} instead of ${reason.from}.`;
  }

  return `The visible link "${reason.linkText}" opens ${reason.actualUrl}.`;
};
