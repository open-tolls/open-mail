type TestConnectionStepProps = {
  checks: { label: string; status: 'idle' | 'running' | 'success' }[];
  helper: string;
  isReady: boolean;
  onBack: () => void;
  onRunChecks: () => Promise<void> | void;
  onContinue: () => void;
};

export const TestConnectionStep = ({
  checks,
  helper,
  isReady,
  onBack,
  onRunChecks,
  onContinue
}: TestConnectionStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">Test connection</p>
      <h2>Validate the account before syncing</h2>
      <p>{helper}</p>
    </div>

    <div className="onboarding-check-list">
      {checks.map((check) => (
        <article className={`onboarding-check-card onboarding-check-${check.status}`} key={check.label}>
          <strong>{check.label}</strong>
          <span>
            {check.status === 'idle' ? 'Waiting' : check.status === 'running' ? 'Running…' : 'Ready'}
          </span>
        </article>
      ))}
    </div>

    <div className="onboarding-step-actions">
      <button className="onboarding-secondary-button" onClick={onBack} type="button">
        Back
      </button>
      <button className="onboarding-secondary-button" onClick={() => void onRunChecks()} type="button">
        Run checks
      </button>
      <button className="onboarding-primary-button" disabled={!isReady} onClick={onContinue} type="button">
        Continue to sync
      </button>
    </div>
  </section>
);
