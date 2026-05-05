import { useState } from 'react';
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
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<string | null>(null);
  const [isSubmittingUnsubscribe, setIsSubmittingUnsubscribe] = useState(false);
  const unsubscribeInfo = extractUnsubscribeInfo(message.headers);

  if (!analysis.isSuspicious && !unsubscribeInfo) {
    return null;
  }

  const openLink = onOpenExternalLink ?? openExternalLink;
  const unsubscribeTarget = unsubscribeInfo?.url ?? unsubscribeInfo?.mailto ?? null;
  const handleUnsubscribe = async () => {
    if (!unsubscribeInfo || !unsubscribeTarget) {
      return;
    }

    if (!unsubscribeInfo.oneClick || !unsubscribeInfo.url) {
      openLink(unsubscribeTarget);
      return;
    }

    setIsSubmittingUnsubscribe(true);
    setUnsubscribeStatus(null);

    try {
      const response = await fetch(unsubscribeInfo.url, {
        method: 'POST',
        headers: {
          'List-Unsubscribe': 'One-Click',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'List-Unsubscribe=One-Click'
      });

      if (!response.ok) {
        throw new Error(`Unsubscribe failed with status ${response.status}`);
      }

      setUnsubscribeStatus('Unsubscribe request sent');
    } catch {
      setUnsubscribeStatus('Could not complete one-click unsubscribe');
    } finally {
      setIsSubmittingUnsubscribe(false);
    }
  };

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
            {unsubscribeStatus ? <p role="status">{unsubscribeStatus}</p> : null}
          </div>
          <button disabled={isSubmittingUnsubscribe} onClick={() => void handleUnsubscribe()} type="button">
            {unsubscribeInfo.oneClick
              ? isSubmittingUnsubscribe
                ? 'Unsubscribing...'
                : 'Unsubscribe now'
              : 'Open unsubscribe'}
          </button>
        </div>
      ) : null}
    </div>
  );
};
