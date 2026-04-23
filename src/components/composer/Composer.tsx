import { useMemo, useState } from 'react';
import { ComposerEditor } from '@components/composer/ComposerEditor';
import { ComposerFooter } from '@components/composer/ComposerFooter';
import { ComposerHeader } from '@components/composer/ComposerHeader';

type ComposerDraft = {
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  to: string;
};

type ComposerProps = {
  from: string;
  initialDraft?: Partial<ComposerDraft>;
  isSending: boolean;
  status: string;
  onClose: () => void;
  onFlushOutbox: () => Promise<void>;
  onSend: (draft: ComposerDraft) => Promise<void>;
};

const defaultDraft: ComposerDraft = {
  bcc: '',
  body: 'Open Mail phase 5 composer is ready for the next review.',
  cc: '',
  subject: 'Desktop alpha update',
  to: 'team@example.com'
};

export const Composer = ({ from, initialDraft, isSending, status, onClose, onFlushOutbox, onSend }: ComposerProps) => {
  const mergedDraft = useMemo(
    () => ({
      ...defaultDraft,
      ...initialDraft
    }),
    [initialDraft]
  );
  const [draft, setDraft] = useState<ComposerDraft>(mergedDraft);
  const [isCcVisible, setIsCcVisible] = useState(Boolean(mergedDraft.cc));
  const [isBccVisible, setIsBccVisible] = useState(Boolean(mergedDraft.bcc));

  const isDirty =
    draft.to !== mergedDraft.to ||
    draft.cc !== mergedDraft.cc ||
    draft.bcc !== mergedDraft.bcc ||
    draft.subject !== mergedDraft.subject ||
    draft.body !== mergedDraft.body;

  const updateDraft = <K extends keyof ComposerDraft>(key: K, value: ComposerDraft[K]) => {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleClose = () => {
    if (isDirty && !window.confirm('Discard this draft?')) {
      return;
    }

    onClose();
  };

  const handleSend = async () => {
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
      <ComposerFooter isSending={isSending} onFlushOutbox={onFlushOutbox} onSend={handleSend} status={status} />
    </section>
  );
};

export type { ComposerDraft };
