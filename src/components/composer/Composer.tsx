import { useEffect, useMemo, useState } from 'react';
import { ComposerAttachments } from '@components/composer/ComposerAttachments';
import { ComposerEditor } from '@components/composer/ComposerEditor';
import { ComposerFooter } from '@components/composer/ComposerFooter';
import { ComposerHeader } from '@components/composer/ComposerHeader';
import { ComposerSignaturePanel } from '@components/composer/ComposerSignaturePanel';
import { toComposerFileAttachment, type ComposerAttachment } from '@lib/composer-attachments';
import { applySignatureHtml, hasSignatureHtml } from '@lib/signature-utils';
import { useSignatureStore } from '@stores/useSignatureStore';

type ComposerDraft = {
  attachments: ComposerAttachment[];
  bcc: string[];
  body: string;
  cc: string[];
  inReplyTo: string | null;
  references: string[];
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
  onDiscard?: () => void;
  onDraftChange?: (draft: ComposerDraft) => void;
  onFlushOutbox: () => Promise<void>;
  onSend: (draft: ComposerDraft) => Promise<boolean>;
};

const defaultDraft: ComposerDraft = {
  attachments: [],
  bcc: [],
  body: '<p>Open Mail phase 5 composer is ready for the next review.</p>',
  cc: [],
  inReplyTo: null,
  references: [],
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
  onDiscard,
  onDraftChange,
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
  const [isSignaturePanelOpen, setIsSignaturePanelOpen] = useState(false);
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const signatures = useSignatureStore((state) => state.signatures);
  const defaultSignatureId = useSignatureStore((state) => state.defaultSignatureId);
  const createSignature = useSignatureStore((state) => state.create);
  const deleteSignature = useSignatureStore((state) => state.delete);
  const setDefaultSignature = useSignatureStore((state) => state.setDefault);
  const updateSignature = useSignatureStore((state) => state.update);

  useEffect(() => {
    setDraft(mergedDraft);
    setIsCcVisible(Boolean(mergedDraft.cc.length));
    setIsBccVisible(Boolean(mergedDraft.bcc.length));
    setActiveSignatureId(hasSignatureHtml(mergedDraft.body) ? defaultSignatureId : null);
  }, [defaultSignatureId, mergedDraft]);

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

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const handleClose = () => {
    onClose();
  };

  const handleDiscard = () => {
    if (isDirty && !window.confirm('Discard this draft?')) {
      return;
    }

    onDiscard?.();
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

  const applySignature = (signatureId: string | null) => {
    const signature = useSignatureStore.getState().signatures.find((candidate) => candidate.id === signatureId) ?? null;
    updateDraft('body', applySignatureHtml(draft.body, signature?.body ?? null));
    setActiveSignatureId(signature?.id ?? null);
  };

  return (
    <section
      aria-label="Composer"
      className="composer-panel"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          void handleSend();
        }
      }}
    >
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
            ...files.map(toComposerFileAttachment)
          ])
        }
        onRemove={(attachmentId) =>
          updateDraft(
            'attachments',
            draft.attachments.filter((attachment) => attachment.id !== attachmentId)
          )
        }
      />
      {isSignaturePanelOpen ? (
        <ComposerSignaturePanel
          activeSignatureId={activeSignatureId}
          signatures={signatures}
          onApplySignature={applySignature}
          onCreateSignature={() => {
            const signatureId = createSignature({
              accountId: null,
              body: '<p>Best,<br />Your name</p>',
              title: `Signature ${signatures.length + 1}`
            });
            applySignature(signatureId);
          }}
          onDeleteSignature={(signatureId) => {
            deleteSignature(signatureId);
            if (activeSignatureId === signatureId) {
              applySignature(null);
            }
          }}
          onSetDefault={setDefaultSignature}
          onToggleOpen={() => setIsSignaturePanelOpen(false)}
          onUpdateSignature={(signatureId, nextSignature) => {
            updateSignature(signatureId, nextSignature);

            if (activeSignatureId === signatureId && nextSignature.body !== undefined) {
              updateDraft('body', applySignatureHtml(draft.body, nextSignature.body));
            }
          }}
        />
      ) : null}
      <ComposerFooter
        isSending={isSending}
        onEditSignature={() => setIsSignaturePanelOpen((current) => !current)}
        onDiscard={handleDiscard}
        onFlushOutbox={onFlushOutbox}
        onSend={handleSend}
        status={localStatus ?? status}
      />
    </section>
  );
};

export type { ComposerAttachment, ComposerDraft };
