import { useEffect, useMemo, useState } from 'react';
import { ComposerAttachments } from '@components/composer/ComposerAttachments';
import { ComposerEditor } from '@components/composer/ComposerEditor';
import { ComposerFooter } from '@components/composer/ComposerFooter';
import { ComposerHeader } from '@components/composer/ComposerHeader';

type ComposerAttachment = {
  file: File;
  id: string;
};

type ComposerDraft = {
  attachments: ComposerAttachment[];
  bcc: string[];
  body: string;
  cc: string[];
  subject: string;
  to: string[];
};

type ComposerProps = {
  from: string;
  initialDraft?: Partial<ComposerDraft>;
  isSending: boolean;
  recipientSuggestions: string[];
  status: string;
  onClose: () => void;
  onFlushOutbox: () => Promise<void>;
  onSend: (draft: ComposerDraft) => Promise<void>;
};

const defaultDraft: ComposerDraft = {
  attachments: [],
  bcc: [],
  body: '<p>Open Mail phase 5 composer is ready for the next review.</p>',
  cc: [],
  subject: 'Desktop alpha update',
  to: ['team@example.com']
};

export const Composer = ({
  from,
  initialDraft,
  isSending,
  recipientSuggestions,
  status,
  onClose,
  onFlushOutbox,
  onSend
}: ComposerProps) => {
  const mergedDraft = useMemo(
    () => ({
      ...defaultDraft,
      ...initialDraft
    }),
    [initialDraft]
  );
  const [draft, setDraft] = useState<ComposerDraft>(mergedDraft);
  const [isCcVisible, setIsCcVisible] = useState(Boolean(mergedDraft.cc.length));
  const [isBccVisible, setIsBccVisible] = useState(Boolean(mergedDraft.bcc.length));
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  const isDirty =
    draft.attachments.length !== mergedDraft.attachments.length ||
    draft.to.join(',') !== mergedDraft.to.join(',') ||
    draft.cc.join(',') !== mergedDraft.cc.join(',') ||
    draft.bcc.join(',') !== mergedDraft.bcc.join(',') ||
    draft.subject !== mergedDraft.subject ||
    draft.body !== mergedDraft.body;

  const updateDraft = <K extends keyof ComposerDraft>(key: K, value: ComposerDraft[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  useEffect(() => {
    setLocalStatus(null);
  }, [draft.attachments, draft.bcc, draft.body, draft.cc, draft.subject, draft.to]);

  const handleClose = () => {
    if (isDirty && !window.confirm('Discard this draft?')) {
      return;
    }

    onClose();
  };

  const handleSend = async () => {
    const recipients = [...draft.to, ...draft.cc, ...draft.bcc];
    if (!recipients.length) {
      setLocalStatus('Please add at least one recipient');
      return;
    }

    if (!draft.subject.trim() && !window.confirm('Send without subject?')) {
      setLocalStatus('Send canceled');
      return;
    }

    await onSend(draft);
  };

  return (
    <section className="composer-panel" aria-label="Composer">
      <ComposerHeader
        bcc={draft.bcc}
        cc={draft.cc}
        from={from}
        isBccVisible={isBccVisible}
        isCcVisible={isCcVisible}
        isSending={isSending}
        recipientSuggestions={recipientSuggestions}
        onBccChange={(value) => updateDraft('bcc', value)}
        onCcChange={(value) => updateDraft('cc', value)}
        onClose={handleClose}
        onSubjectChange={(value) => updateDraft('subject', value)}
        onToChange={(value) => updateDraft('to', value)}
        onToggleBcc={() => setIsBccVisible((current) => !current)}
        onToggleCc={() => setIsCcVisible((current) => !current)}
        subject={draft.subject}
        to={draft.to}
      />
      <ComposerEditor body={draft.body} onBodyChange={(value) => updateDraft('body', value)} />
      <ComposerAttachments
        attachments={draft.attachments}
        onAdd={(files) =>
          updateDraft('attachments', [
            ...draft.attachments,
            ...files.map((file) => ({
              file,
              id: `${file.name}-${file.size}-${file.lastModified}`
            }))
          ])
        }
        onRemove={(attachmentId) =>
          updateDraft(
            'attachments',
            draft.attachments.filter((attachment) => attachment.id !== attachmentId)
          )
        }
      />
      <ComposerFooter
        isSending={isSending}
        onDiscard={handleClose}
        onFlushOutbox={onFlushOutbox}
        onSend={handleSend}
        status={localStatus ?? status}
      />
    </section>
  );
};

export type { ComposerAttachment, ComposerDraft };
