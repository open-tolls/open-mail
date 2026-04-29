import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Cloud,
  Mail,
  Server,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { DoneStep } from '@components/onboarding/DoneStep';
import { ImapStep, type ImapFormState } from '@components/onboarding/ImapStep';
import { OAuthStep } from '@components/onboarding/OAuthStep';
import { OnboardingLayout } from '@components/onboarding/OnboardingLayout';
import { ProviderCard } from '@components/onboarding/ProviderCard';
import { SyncStep } from '@components/onboarding/SyncStep';
import { TestConnectionStep } from '@components/onboarding/TestConnectionStep';
import { WelcomeStep } from '@components/onboarding/WelcomeStep';
import type { AccountProvider, ConnectionSettings, SecurityType } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import { useAccountStore } from '@stores/useAccountStore';

type ProviderKind = 'oauth' | 'imap';
type StepId = 'welcome' | 'provider' | 'oauth' | 'imap' | 'test' | 'sync' | 'done';
type ConnectionCheckStatus = 'idle' | 'running' | 'success' | 'error';

type ProviderOption = {
  description: string;
  id: string;
  icon: typeof Mail;
  kind: ProviderKind;
  provider: AccountProvider;
  title: string;
};

const providerOptions: ProviderOption[] = [
  {
    id: 'gmail',
    title: 'Gmail',
    description: 'Use the browser auth flow and default Google mail settings.',
    icon: Sparkles,
    kind: 'oauth',
    provider: 'Gmail'
  },
  {
    id: 'outlook',
    title: 'Outlook',
    description: 'Microsoft 365 or Outlook.com with OAuth browser sign-in.',
    icon: Building2,
    kind: 'oauth',
    provider: 'Outlook'
  },
  {
    id: 'yahoo',
    title: 'Yahoo',
    description: 'Starts with known IMAP defaults and keeps the manual path editable.',
    icon: Cloud,
    kind: 'imap',
    provider: 'Yahoo'
  },
  {
    id: 'icloud',
    title: 'iCloud',
    description: 'Prefills Apple mail servers so you only confirm credentials.',
    icon: ShieldCheck,
    kind: 'imap',
    provider: 'Imap'
  },
  {
    id: 'fastmail',
    title: 'Fastmail',
    description: 'Starts with provider-friendly IMAP and SMTP defaults.',
    icon: Mail,
    kind: 'imap',
    provider: 'Imap'
  },
  {
    id: 'other',
    title: 'Other IMAP',
    description: 'Manual incoming and outgoing server setup.',
    icon: Server,
    kind: 'imap',
    provider: 'Imap'
  }
];

const onboardingSteps = [
  {
    title: 'Welcome',
    description: 'Set expectations and get the account flow moving.'
  },
  {
    title: 'Provider',
    description: 'Choose the provider strategy: OAuth or manual IMAP.'
  },
  {
    title: 'Setup',
    description: 'Authorize the browser flow or confirm IMAP/SMTP settings.'
  },
  {
    title: 'Test',
    description: 'Validate the chosen path before we start syncing.'
  },
  {
    title: 'Sync',
    description: 'Run the first inbox sync and stage the rest in background.'
  },
  {
    title: 'Done',
    description: 'Open the mailbox or add another account right away.'
  }
];

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const createEmptyConnectionChecks = (): { label: string; status: ConnectionCheckStatus }[] => [
  { label: 'Incoming mail', status: 'idle' },
  { label: 'Outgoing mail', status: 'idle' }
];

const createCodeChallenge = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const parsePort = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toSecurityType = (value: ImapFormState['imapSecurity']): SecurityType => {
  switch (value) {
    case 'SSL':
      return 'Ssl';
    case 'StartTLS':
      return 'StartTls';
    default:
      return 'None';
  }
};

const toConnectionSettings = (form: ImapFormState): ConnectionSettings => ({
  imapHost: form.imapHost.trim(),
  imapPort: parsePort(form.imapPort, 993),
  imapSecurity: toSecurityType(form.imapSecurity),
  smtpHost: form.smtpHost.trim(),
  smtpPort: parsePort(form.smtpPort, 587),
  smtpSecurity: toSecurityType(form.smtpSecurity)
});

const isImapFormReady = (form: ImapFormState) =>
  Boolean(
    form.displayName.trim() &&
      form.email.trim() &&
      form.password &&
      form.imapHost.trim() &&
      form.smtpHost.trim() &&
      parsePort(form.imapPort, 0) > 0 &&
      parsePort(form.smtpPort, 0) > 0
  );

const defaultImapForm = (provider: ProviderOption | null): ImapFormState => {
  switch (provider?.id) {
    case 'yahoo':
      return {
        displayName: '',
        email: '',
        password: '',
        imapHost: 'imap.mail.yahoo.com',
        imapPort: '993',
        imapSecurity: 'SSL',
        smtpHost: 'smtp.mail.yahoo.com',
        smtpPort: '465',
        smtpSecurity: 'SSL'
      };
    case 'icloud':
      return {
        displayName: '',
        email: '',
        password: '',
        imapHost: 'imap.mail.me.com',
        imapPort: '993',
        imapSecurity: 'SSL',
        smtpHost: 'smtp.mail.me.com',
        smtpPort: '587',
        smtpSecurity: 'StartTLS'
      };
    case 'fastmail':
      return {
        displayName: '',
        email: '',
        password: '',
        imapHost: 'imap.fastmail.com',
        imapPort: '993',
        imapSecurity: 'SSL',
        smtpHost: 'smtp.fastmail.com',
        smtpPort: '465',
        smtpSecurity: 'SSL'
      };
    default:
      return {
        displayName: '',
        email: '',
        password: '',
        imapHost: '',
        imapPort: '993',
        imapSecurity: 'SSL',
        smtpHost: '',
        smtpPort: '587',
        smtpSecurity: 'StartTLS'
      };
  }
};

export const OnboardingView = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const upsertAccount = useAccountStore((state) => state.upsertAccount);
  const selectAccount = useAccountStore((state) => state.selectAccount);
  const [step, setStep] = useState<StepId>('welcome');
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);
  const [oauthAuthUrl, setOauthAuthUrl] = useState<string | null>(null);
  const [imapForm, setImapForm] = useState<ImapFormState>(defaultImapForm(null));
  const [connectionChecks, setConnectionChecks] = useState<{ label: string; status: ConnectionCheckStatus }[]>(
    createEmptyConnectionChecks()
  );
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('Ready to start initial sync');

  const currentStepIndex = useMemo(() => {
    switch (step) {
      case 'welcome':
        return 0;
      case 'provider':
        return 1;
      case 'oauth':
      case 'imap':
        return 2;
      case 'test':
        return 3;
      case 'sync':
        return 4;
      case 'done':
        return 5;
    }
  }, [step]);

  const testHelper = selectedProvider?.kind === 'oauth'
    ? 'We validate that the OAuth request is prepared and the browser handoff is ready.'
    : 'We validate the IMAP and SMTP settings you entered, then persist the account before the first sync starts.';

  const checksReady = connectionChecks.every((check) => check.status === 'success');
  const canReviewImapConnection = isImapFormReady(imapForm);

  const resetFlow = () => {
    setSelectedProvider(null);
    setOauthClientId('');
    setOauthStatus(null);
    setOauthAuthUrl(null);
    setImapForm(defaultImapForm(null));
    setConnectionChecks(createEmptyConnectionChecks());
    setConnectionStatus(null);
    setCreatedAccountId(null);
    setSyncProgress(0);
    setSyncStatus('Ready to start initial sync');
    setStep('provider');
  };

  const handleSelectProvider = (provider: ProviderOption) => {
    setSelectedProvider(provider);
    setOauthStatus(null);
    setOauthAuthUrl(null);
    setConnectionChecks(createEmptyConnectionChecks());
    setConnectionStatus(null);
    setCreatedAccountId(null);
    setSyncProgress(0);
    setSyncStatus('Ready to start initial sync');

    if (provider.kind === 'imap') {
      setImapForm(defaultImapForm(provider));
      setStep('imap');
      return;
    }

    setStep('oauth');
  };

  const handlePrepareOAuth = async () => {
    if (!selectedProvider) {
      return;
    }

    if (!oauthClientId.trim()) {
      setOauthStatus('Add a client ID before preparing the browser auth request.');
      return;
    }

    const request = {
      provider: selectedProvider.provider,
      clientId: oauthClientId.trim(),
      redirectUri: 'openmail://oauth/callback',
      state: null,
      codeChallenge: createCodeChallenge()
    } as const;

    if (!tauriRuntime.isAvailable()) {
      setOauthAuthUrl(`preview://${selectedProvider.id}/oauth?client_id=${encodeURIComponent(request.clientId)}`);
      setOauthStatus('Browser auth preview prepared in web mode.');
      return;
    }

    try {
      const authRequest = await api.auth.buildOAuthAuthorizationUrl(request);
      setOauthAuthUrl(authRequest.authorizationUrl);
      setOauthStatus(`Browser auth prepared for ${selectedProvider.title}.`);
      await api.system.openExternalUrl(authRequest.authorizationUrl);
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : 'Could not prepare browser auth');
    }
  };

  const handleRunChecks = async () => {
    setConnectionStatus(null);

    if (selectedProvider?.kind === 'oauth') {
      setConnectionChecks((checks) => checks.map((check) => ({ ...check, status: 'running' })));
      await sleep(250);
      setConnectionChecks((checks) =>
        checks.map((check, index) => ({
          ...check,
          status: index === 0 && !oauthAuthUrl ? 'error' : 'success'
        }))
      );
      setConnectionStatus(
        oauthAuthUrl
          ? 'Browser auth is prepared. OAuth token exchange lands in the next cut.'
          : 'Prepare the browser auth request before continuing.'
      );
      return;
    }

    const request = {
      settings: toConnectionSettings(imapForm),
      credentials: {
        username: imapForm.email.trim(),
        password: imapForm.password
      }
    } as const;

    setConnectionChecks([
      { label: 'Incoming mail', status: 'running' },
      { label: 'Outgoing mail', status: 'idle' }
    ]);

    if (!tauriRuntime.isAvailable()) {
      await sleep(250);
      setConnectionChecks([
        { label: 'Incoming mail', status: 'success' },
        { label: 'Outgoing mail', status: 'success' }
      ]);
      setConnectionStatus('Web mode preview passed. Desktop runtime will execute the real checks.');
      return;
    }

    try {
      await api.onboarding.testImapConnection(request);
      setConnectionChecks([
        { label: 'Incoming mail', status: 'success' },
        { label: 'Outgoing mail', status: 'running' }
      ]);
    } catch (error) {
      setConnectionChecks([
        { label: 'Incoming mail', status: 'error' },
        { label: 'Outgoing mail', status: 'idle' }
      ]);
      setConnectionStatus(error instanceof Error ? error.message : 'Could not reach the IMAP server');
      return;
    }

    try {
      await api.onboarding.testSmtpConnection(request);
      setConnectionChecks([
        { label: 'Incoming mail', status: 'success' },
        { label: 'Outgoing mail', status: 'success' }
      ]);
      setConnectionStatus('IMAP and SMTP checks passed.');
    } catch (error) {
      setConnectionChecks([
        { label: 'Incoming mail', status: 'success' },
        { label: 'Outgoing mail', status: 'error' }
      ]);
      setConnectionStatus(error instanceof Error ? error.message : 'Could not reach the SMTP server');
    }
  };

  const handleContinueFromChecks = async () => {
    if (selectedProvider?.kind === 'oauth') {
      setStep('sync');
      return;
    }

    if (createdAccountId) {
      setStep('sync');
      return;
    }

    const accountRequest = {
      name: imapForm.displayName.trim(),
      email: imapForm.email.trim(),
      provider: selectedProvider?.provider ?? 'Imap',
      settings: toConnectionSettings(imapForm),
      credentials: {
        username: imapForm.email.trim(),
        password: imapForm.password
      }
    } as const;

    try {
      if (!tauriRuntime.isAvailable()) {
        const localAccountId = `acc_local_${Date.now()}`;
        upsertAccount({
          id: localAccountId,
          provider: accountRequest.provider,
          email: accountRequest.email,
          displayName: accountRequest.name
        });
        selectAccount(localAccountId);
        setCreatedAccountId(localAccountId);
        setStep('sync');
        return;
      }

      const account = await api.accounts.add(accountRequest);
      upsertAccount({
        id: account.id,
        provider: account.provider,
        email: account.emailAddress,
        displayName: account.name
      });
      selectAccount(account.id);
      setCreatedAccountId(account.id);
      setConnectionStatus('Account saved locally. Ready to start the first sync.');
      setStep('sync');
    } catch (error) {
      setConnectionStatus(error instanceof Error ? error.message : 'Could not save the account');
    }
  };

  const handleRunSync = async () => {
    setSyncStatus('Syncing inbox headers…');
    setSyncProgress(18);

    if (tauriRuntime.isAvailable() && createdAccountId) {
      try {
        await api.sync.start(createdAccountId);
      } catch (error) {
        setSyncStatus(error instanceof Error ? error.message : 'Could not start background sync');
        return;
      }
    }

    await sleep(220);
    setSyncStatus('Applying first thread window…');
    setSyncProgress(54);
    await sleep(220);
    setSyncStatus('Handing the rest to background sync…');
    setSyncProgress(100);
    await queryClient.invalidateQueries({ queryKey: ['mailbox-overview'] });
    await queryClient.invalidateQueries({ queryKey: ['sync-status-detail'] });
    setStep('done');
  };

  return (
    <OnboardingLayout
      currentStep={currentStepIndex}
      eyebrow="Phase 6"
      steps={onboardingSteps}
      title="Bring the first account online without leaving the product."
    >
      {step === 'welcome' ? <WelcomeStep onContinue={() => setStep('provider')} /> : null}

      {step === 'provider' ? (
        <section className="onboarding-step-screen">
          <div className="onboarding-step-copy">
            <p className="eyebrow">Providers</p>
            <h2>Add your email account</h2>
            <p>Choose the path that matches the provider. OAuth goes through the system browser; everything else starts from IMAP/SMTP defaults you can edit.</p>
          </div>

          <div className="provider-grid">
            {providerOptions.map((provider) => (
              <ProviderCard
                description={provider.description}
                icon={provider.icon}
                isRecommended={provider.kind === 'oauth'}
                key={provider.id}
                name={provider.title}
                onClick={() => handleSelectProvider(provider)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {step === 'oauth' && selectedProvider ? (
        <OAuthStep
          authUrl={oauthAuthUrl}
          clientId={oauthClientId}
          onBack={() => setStep('provider')}
          onClientIdChange={setOauthClientId}
          onContinue={() => setStep('test')}
          onPrepare={handlePrepareOAuth}
          providerName={selectedProvider.title}
          status={oauthStatus}
        />
      ) : null}

      {step === 'imap' ? (
        <ImapStep
          canContinue={canReviewImapConnection}
          form={imapForm}
          onBack={() => setStep('provider')}
          onChange={(field, value) =>
            setImapForm((current) => ({
              ...current,
              [field]: value
            }))
          }
          onContinue={() => {
            setConnectionChecks(createEmptyConnectionChecks());
            setConnectionStatus(null);
            setStep('test');
          }}
        />
      ) : null}

      {step === 'test' ? (
        <TestConnectionStep
          checks={connectionChecks}
          helper={testHelper}
          isReady={checksReady}
          onBack={() => setStep(selectedProvider?.kind === 'oauth' ? 'oauth' : 'imap')}
          onContinue={() => void handleContinueFromChecks()}
          onRunChecks={handleRunChecks}
          status={connectionStatus}
        />
      ) : null}

      {step === 'sync' ? (
        <SyncStep
          onOpenInbox={() => navigate('/')}
          onRunSync={handleRunSync}
          progress={syncProgress}
          status={syncStatus}
        />
      ) : null}

      {step === 'done' ? <DoneStep onAddAnother={resetFlow} /> : null}
    </OnboardingLayout>
  );
};
