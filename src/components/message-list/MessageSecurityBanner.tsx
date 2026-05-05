import { ShieldAlert } from 'lucide-react';
import { extractUnsubscribeInfo, getPhishingWarningCopy, type MessageSecurityAnalysis } from '@lib/message-security';
import type { MessageRecord } from '@lib/contracts';

type MessageSecurityBannerProps = {
  analysis: MessageSecurityAnalysis;
  message: MessageRecord;
  onOpenExternalLink?: (url: string) => void;
};

const openExternalLink = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const MessageSecurityBanner = ({ analysis, message, onOpenExternalLink }: MessageSecurityBannerProps) => {
  const unsubscribeInfo = extractUnsubscribeInfo(message.headers);

  if (!analysis.isSuspicious && !unsubscribeInfo) {
    return null;
  }

  const openLink = onOpenExternalLink ?? openExternalLink;
  const unsubscribeTarget = unsubscribeInfo?.url ?? unsubscribeInfo?.mailto ?? null;

  return (
    <div className="message-security-stack">
      {analysis.isSuspicious ? (
        <div className="message-security-banner" role="alert">
          <div className="message-security-banner-header">
            <ShieldAlert size={16} />
            <strong>Potential phishing indicators detected</strong>
          </div>
          <ul className="message-security-list">
            {analysis.reasons.map((reason, index) => (
              <li key={`${reason.type}-${index}`}>{getPhishingWarningCopy(reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {unsubscribeInfo && unsubscribeTarget ? (
        <div className="message-unsubscribe-banner">
          <div>
            <strong>{unsubscribeInfo.oneClick ? 'One-click unsubscribe available' : 'Newsletter unsubscribe available'}</strong>
            <p>Open Mail found standard list-unsubscribe headers for this sender.</p>
          </div>
          <button onClick={() => openLink(unsubscribeTarget)} type="button">
            {unsubscribeInfo.oneClick ? 'Unsubscribe now' : 'Open unsubscribe'}
          </button>
        </div>
      ) : null}
    </div>
  );
};
