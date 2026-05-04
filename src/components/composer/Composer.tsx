import { useEffect, useMemo, useRef, useState } from 'react';
import { ComposerAttachments } from '@components/composer/ComposerAttachments';
import { ComposerEditor } from '@components/composer/ComposerEditor';
import { ComposerFooter } from '@components/composer/ComposerFooter';
import { ComposerHeader } from '@components/composer/ComposerHeader';
import { ComposerSignaturePanel } from '@components/composer/ComposerSignaturePanel';
import { toComposerFileAttachment, type ComposerAttachment } from '@lib/composer-attachments';
import { applySignatureHtml, hasSignatureHtml, stripSignatureHtml } from '@lib/signature-utils';
import type { AccountRecord } from '@stores/useAccountStore';
import {
  deleteSignatureFromBackend,
  resolveSignatureForAccount,
  saveSignatureToBackend,
  setDefaultSignatureOnBackend,
  useSignatureStore
} from '@stores/useSignatureStore';

type ComposerDraft = {
  attachments: ComposerAttachment[];
  bcc: string[];
  body: string;
  cc: string[];
  fromAccountId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  to: string[];
};

type ComposerProps = {
  from?: string;
  fromOptions?: AccountRecord[];
  initialDraft?: Partial<ComposerDraft>;
  isSending: boolean;
  recipientSuggestions: string[];
  status: string;
  onClose: () => void;
  onDiscard?: () => void;
  onDraftChange?: (draft: ComposerDraft) => void;
  onFlushOutbox: () => Promise<void>;
  onSchedule: (draft: ComposerDraft, sendAt: string) => Promise<boolean>;
  onSend: (draft: ComposerDraft) => Promise<boolean>;
};

const defaultDraft: ComposerDraft = {
  attachments: [],
  bcc: [],
  body: '<p>Open Mail phase 5 composer is ready for the next review.</p>',
  cc: [],
  fromAccountId: 'acc_demo',
  inReplyTo: null,
  references: [],
  subject: 'Desktop alpha update',
  to: ['team@example.com']
};

const hasQuotedContent = (body: string) => /class="(?:gmail_quote|forward_quote)"/.test(body);
const getHtmlTextContent = (body: string) =>
  body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const Composer = ({
  from,
  fromOptions,
  initialDraft,
  isSending,
  recipientSuggestions,
  status,
  onClose,
  onDiscard,
  onDraftChange,
  onFlushOutbox,
  onSchedule,
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
  const [isQuotedTextCollapsed, setIsQuotedTextCollapsed] = useState(hasQuotedContent(mergedDraft.body));
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [customSendAt, setCustomSendAt] = useState('');
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const signatures = useSignatureStore((state) => state.signatures);
  const defaultSignatureId = useSignatureStore((state) => state.defaultSignatureId);
  const defaultSignatureIdsByAccountId = useSignatureStore((state) => state.defaultSignatureIdsByAccountId);
  const createSignature = useSignatureStore((state) => state.create);
  const deleteSignature = useSignatureStore((state) => state.delete);
  const setDefaultSignature = useSignatureStore((state) => state.setDefault);
  const updateSignature = useSignatureStore((state) => state.update);
  const previousFromAccountIdRef = useRef(mergedDraft.fromAccountId);
  const resolvedFromOptions = fromOptions?.length
    ? fromOptions
    : [
        {
          id: mergedDraft.fromAccountId,
          provider: 'Gmail' as const,
          email: from ?? 'leco@example.com',
          displayName: 'Open Mail'
        }
      ];
  const resolvedDefaultSignature = useMemo(
    () =>
      resolveSignatureForAccount(
        signatures,
        defaultSignatureId,
        defaultSignatureIdsByAccountId,
        draft.fromAccountId
      ),
    [defaultSignatureId, defaultSignatureIdsByAccountId, draft.fromAccountId, signatures]
  );

  useEffect(() => {
    setDraft(mergedDraft);
    setIsCcVisible(Boolean(mergedDraft.cc.length));
    setIsBccVisible(Boolean(mergedDraft.bcc.length));
    const initialSignature = hasSignatureHtml(mergedDraft.body)
      ? resolveSignatureForAccount(
          signatures,
          defaultSignatureId,
          defaultSignatureIdsByAccountId,
          mergedDraft.fromAccountId
        )
      : null;
    setActiveSignatureId(initialSignature?.id ?? null);
    setIsQuotedTextCollapsed(hasQuotedContent(mergedDraft.body));
    previousFromAccountIdRef.current = mergedDraft.fromAccountId;
  }, [defaultSignatureId, defaultSignatureIdsByAccountId, mergedDraft, signatures]);

  const hasQuotedSection = hasQuotedContent(draft.body);
  const activeFromAccount =
    resolvedFromOptions.find((account) => account.id === draft.fromAccountId) ?? resolvedFromOptions[0] ?? null;

  const isDirty =
    draft.attachments.length !== mergedDraft.attachments.length ||
    draft.to.join(',') !== mergedDraft.to.join(',') ||
    draft.cc.join(',') !== mergedDraft.cc.join(',') ||
    draft.bcc.join(',') !== mergedDraft.bcc.join(',') ||
    draft.fromAccountId !== mergedDraft.fromAccountId ||
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
  }, [draft.attachments, draft.bcc, draft.body, draft.cc, draft.fromAccountId, draft.subject, draft.to]);

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  useEffect(() => {
    if (draft.fromAccountId === previousFromAccountIdRef.current) {
      return;
    }

    const previousFromAccountId = previousFromAccountIdRef.current;
    previousFromAccountIdRef.current = draft.fromAccountId;
    const previousDefaultSignature = resolveSignatureForAccount(
      signatures,
      defaultSignatureId,
      defaultSignatureIdsByAccountId,
      previousFromAccountId
    );

    const contentWithoutSignature = getHtmlTextContent(stripSignatureHtml(draft.body));
    const bodyText = getHtmlTextContent(draft.body);
    const previousSignatureText = getHtmlTextContent(previousDefaultSignature?.body ?? '');
    const nextSignatureText = getHtmlTextContent(resolvedDefaultSignature?.body ?? '');
    const isSignatureOnlyBody =
      !contentWithoutSignature ||
      bodyText === previousSignatureText ||
      bodyText === nextSignatureText;

    if (!isSignatureOnlyBody) {
      return;
    }

    updateDraft('body', applySignatureHtml(draft.body, resolvedDefaultSignature?.body ?? null));
    setActiveSignatureId(resolvedDefaultSignature?.id ?? null);
  }, [
    defaultSignatureId,
    defaultSignatureIdsByAccountId,
    draft.body,
    draft.fromAccountId,
    resolvedDefaultSignature,
    signatures
  ]);

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

  const buildSchedulePresets = () => {
    const now = new Date();
    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(8, 0, 0, 0);

    const tomorrowAfternoon = new Date(now);
    tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
    tomorrowAfternoon.setHours(13, 0, 0, 0);

    const mondayMorning = new Date(now);
    mondayMorning.setDate(mondayMorning.getDate() + ((8 - mondayMorning.getDay()) % 7 || 7));
    mondayMorning.setHours(8, 0, 0, 0);

    return [
      { id: 'tomorrow-morning', label: 'Tomorrow morning', sendAt: tomorrowMorning.toISOString() },
      { id: 'tomorrow-afternoon', label: 'Tomorrow afternoon', sendAt: tomorrowAfternoon.toISOString() },
      { id: 'monday-morning', label: 'Monday morning', sendAt: mondayMorning.toISOString() }
    ];
  };

  const handleSchedule = async (sendAt: string) => {
    const recipients = [...draft.to, ...draft.cc, ...draft.bcc];
    if (!recipients.length) {
      setLocalStatus('Please add at least one recipient');
      return;
    }

    if (!draft.subject.trim() && !window.confirm('Schedule without subject?')) {
      setLocalStatus('Schedule canceled');
      return;
    }

    const didSchedule = await onSchedule(draft, sendAt);
    if (didSchedule) {
      setIsScheduleDialogOpen(false);
      setCustomSendAt('');
    }
  };

  const applySignature = (signatureId: string | null) => {
    const signature = useSignatureStore.getState().signatures.find((candidate) => candidate.id === signatureId) ?? null;
    updateDraft('body', applySignatureHtml(draft.body, signature?.body ?? null));
    setActiveSignatureId(signature?.id ?? null);
  };
  const schedulePresets = buildSchedulePresets();

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
        fromOptions={resolvedFromOptions}
        isBccVisible={isBccVisible}
        isCcVisible={isCcVisible}
        isSending={isSending}
        recipientSuggestions={recipientSuggestions}
        onBccChange={(value) => updateDraft('bcc', value)}
        onCcChange={(value) => updateDraft('cc', value)}
        onClose={handleClose}
        onFromChange={(value) => updateDraft('fromAccountId', value)}
        onSubjectChange={(value) => updateDraft('subject', value)}
        onToChange={(value) => updateDraft('to', value)}
        onToggleBcc={() => setIsBccVisible((current) => !current)}
        onToggleCc={() => setIsCcVisible((current) => !current)}
        selectedFromAccountId={activeFromAccount?.id ?? draft.fromAccountId}
        subject={draft.subject}
        to={draft.to}
      />
      <div
        className={hasQuotedSection && isQuotedTextCollapsed ? 'composer-quoted-shell composer-quoted-shell-collapsed' : 'composer-quoted-shell'}
      >
        {hasQuotedSection ? (
          <button
            aria-expanded={!isQuotedTextCollapsed}
            className="composer-quoted-toggle"
            onClick={() => setIsQuotedTextCollapsed((current) => !current)}
            type="button"
          >
            {isQuotedTextCollapsed ? 'Show quoted text' : 'Hide quoted text'}
          </button>
        ) : null}
        <ComposerEditor body={draft.body} onBodyChange={(value) => updateDraft('body', value)} />
      </div>
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
              accountId: draft.fromAccountId,
              body: '<p>Best,<br />Your name</p>',
              title: `Signature ${signatures.length + 1}`
            });
            void saveSignatureToBackend({
              id: signatureId,
              accountId: draft.fromAccountId,
              body: '<p>Best,<br />Your name</p>',
              title: `Signature ${signatures.length + 1}`
            }).catch(() => {
              setLocalStatus('Could not save signature');
            });
            applySignature(signatureId);
          }}
          onDeleteSignature={(signatureId) => {
            deleteSignature(signatureId);
            void deleteSignatureFromBackend(signatureId).catch(() => {
              setLocalStatus('Could not delete signature');
            });
            if (activeSignatureId === signatureId) {
              applySignature(null);
            }
          }}
          onSetDefault={(signatureId) => {
            setDefaultSignature(signatureId, draft.fromAccountId);
            void setDefaultSignatureOnBackend(signatureId, draft.fromAccountId).catch(() => {
              setLocalStatus('Could not update default signature');
            });
          }}
          onToggleOpen={() => setIsSignaturePanelOpen(false)}
          onUpdateSignature={(signatureId, nextSignature) => {
            updateSignature(signatureId, nextSignature);
            const nextStoredSignature = useSignatureStore
              .getState()
              .signatures.find((candidate) => candidate.id === signatureId);

            if (nextStoredSignature) {
              void saveSignatureToBackend(nextStoredSignature).catch(() => {
                setLocalStatus('Could not save signature');
              });
            }

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
        onOpenSchedule={() => setIsScheduleDialogOpen(true)}
        onSend={handleSend}
        status={localStatus ?? status}
      />
      {isScheduleDialogOpen ? (
        <div aria-label="Send later dialog" className="thread-action-dialog" role="dialog">
          <div>
            <strong>Schedule this message</strong>
            <button aria-label="Close send later dialog" onClick={() => setIsScheduleDialogOpen(false)} type="button">
              Close
            </button>
          </div>
          <div className="thread-action-dialog-options">
            {schedulePresets.map((preset) => (
              <button key={preset.id} onClick={() => void handleSchedule(preset.sendAt)} type="button">
                {preset.label}
              </button>
            ))}
            <label className="thread-action-field">
              <span>Pick date & time</span>
              <input
                aria-label="Pick send later date and time"
                onChange={(event) => setCustomSendAt(event.target.value)}
                type="datetime-local"
                value={customSendAt}
              />
            </label>
            <button
              disabled={!customSendAt}
              onClick={() => void handleSchedule(new Date(customSendAt).toISOString())}
              type="button"
            >
              Schedule custom time
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export type { ComposerAttachment, ComposerDraft };
