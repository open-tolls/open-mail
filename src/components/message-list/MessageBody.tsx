import { type MouseEvent, useMemo, useState } from 'react';
import type { AttachmentRecord } from '@lib/contracts';

type MessageBodyProps = {
  attachments?: AttachmentRecord[];
  html: string;
  onOpenExternalLink?: (url: string) => void;
  plainText: string | null;
  resolveInlineImageUrl?: (localPath: string) => string;
};

const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']);
const allowedImageProtocols = new Set(['http:', 'https:']);
const allowedLinkProtocols = new Set(['http:', 'https:', 'mailto:']);

const getSafeUrl = (rawUrl: string) => {
  try {
    return new URL(rawUrl, window.location.href);
  } catch {
    return null;
  }
};

const normalizeContentId = (contentId: string) => contentId.trim().replace(/^<|>$/g, '').toLowerCase();

const getCidValue = (src: string) => {
  if (!src.trim().toLowerCase().startsWith('cid:')) {
    return null;
  }

  return normalizeContentId(decodeURIComponent(src.trim().slice(4)));
};

const getInlineImageSources = (
  attachments: AttachmentRecord[],
  resolveInlineImageUrl: (localPath: string) => string
) => {
  const sources = new Map<string, string>();

  attachments.forEach((attachment) => {
    if (!attachment.is_inline || !attachment.content_id || !attachment.local_path) {
      return;
    }

    sources.set(normalizeContentId(attachment.content_id), resolveInlineImageUrl(attachment.local_path));
  });

  return sources;
};

const isTrackingPixel = (image: HTMLImageElement) => {
  const width = Number.parseInt(image.getAttribute('width') ?? '', 10);
  const height = Number.parseInt(image.getAttribute('height') ?? '', 10);

  return width <= 1 && height <= 1;
};

const hasRemoteImages = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;

  return [...template.content.querySelectorAll('img')].some((image) => {
    const src = image.getAttribute('src');
    const safeUrl = src ? getSafeUrl(src) : null;

    return safeUrl ? allowedImageProtocols.has(safeUrl.protocol) && !isTrackingPixel(image) : false;
  });
};

const sanitizeEmailHtml = (html: string, allowRemoteImages: boolean, inlineImageSources: Map<string, string>) => {
  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('*').forEach((element) => {
    const tagName = element.tagName.toLowerCase();

    if (blockedTags.has(element.tagName.toLowerCase())) {
      element.remove();
      return;
    }

    [...element.attributes].forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();
      const attributeValue = attribute.value.trim().toLowerCase();
      if (attributeName.startsWith('on') || attributeValue.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    });

    if (tagName === 'a') {
      const anchor = element as HTMLAnchorElement;
      const safeUrl = getSafeUrl(anchor.getAttribute('href') ?? '');

      if (!safeUrl || !allowedLinkProtocols.has(safeUrl.protocol)) {
        anchor.removeAttribute('href');
        return;
      }

      anchor.href = safeUrl.toString();
      anchor.rel = 'noreferrer noopener';
      anchor.target = '_blank';
    }

    if (tagName === 'img') {
      const image = element as HTMLImageElement;
      const rawSrc = image.getAttribute('src') ?? '';
      const cidValue = getCidValue(rawSrc);

      if (isTrackingPixel(image)) {
        image.remove();
        return;
      }

      if (cidValue) {
        const inlineSrc = inlineImageSources.get(cidValue);

        if (!inlineSrc) {
          image.remove();
          return;
        }

        image.src = inlineSrc;
        image.loading = 'lazy';
        image.decoding = 'async';
        return;
      }

      const safeUrl = getSafeUrl(rawSrc);

      if (!allowRemoteImages || !safeUrl || !allowedImageProtocols.has(safeUrl.protocol)) {
        image.remove();
        return;
      }

      image.src = safeUrl.toString();
      image.loading = 'lazy';
      image.decoding = 'async';
    }
  });

  return template.innerHTML;
};

const openExternalLink = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const resolveLocalInlineImageUrl = (localPath: string) => localPath;

export const MessageBody = ({
  attachments = [],
  html,
  onOpenExternalLink,
  plainText,
  resolveInlineImageUrl = resolveLocalInlineImageUrl
}: MessageBodyProps) => {
  const [isQuotedTextVisible, setIsQuotedTextVisible] = useState(false);
  const [areRemoteImagesVisible, setAreRemoteImagesVisible] = useState(false);
  const rawBody = html || plainText || '';
  const hasBlockedRemoteImages = useMemo(() => hasRemoteImages(rawBody), [rawBody]);
  const inlineImageSources = useMemo(
    () => getInlineImageSources(attachments, resolveInlineImageUrl),
    [attachments, resolveInlineImageUrl]
  );
  const sanitizedHtml = useMemo(
    () => sanitizeEmailHtml(rawBody, areRemoteImagesVisible, inlineImageSources),
    [areRemoteImagesVisible, inlineImageSources, rawBody]
  );

  const handleBodyClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    const link = event.target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    event.preventDefault();
    const openLink = onOpenExternalLink ?? openExternalLink;
    openLink(link.href);
  };

  return (
    <div className="message-body">
      {hasBlockedRemoteImages && !areRemoteImagesVisible ? (
        <div className="message-remote-images-warning">
          <span>Remote images are blocked for privacy.</span>
          <button onClick={() => setAreRemoteImagesVisible(true)} type="button">
            Load remote images
          </button>
        </div>
      ) : null}
      <div
        className="message-body-content"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        onClick={handleBodyClick}
      />
      <button
        aria-expanded={isQuotedTextVisible}
        className="message-quote-toggle"
        onClick={() => setIsQuotedTextVisible((current) => !current)}
        type="button"
      >
        {isQuotedTextVisible ? 'Hide quoted text' : 'Show quoted text'}
      </button>
      {isQuotedTextVisible ? <blockquote className="message-quoted-text">Quoted text placeholder</blockquote> : null}
    </div>
  );
};
