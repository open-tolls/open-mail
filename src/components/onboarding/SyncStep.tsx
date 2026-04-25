type SyncStepProps = {
  onOpenInbox: () => void;
  onRunSync: () => Promise<void> | void;
  progress: number;
  status: string;
};

export const SyncStep = ({ onOpenInbox, onRunSync, progress, status }: SyncStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">Initial sync</p>
      <h2>Warm up the inbox</h2>
      <p>We sync the inbox first so you can start working quickly, then the rest of the folders continue in the background.</p>
    </div>

    <div className="onboarding-progress-card">
      <div>
        <strong>{status}</strong>
        <span>{progress}% ready</span>
      </div>
      <div className="onboarding-progress-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>

    <div className="onboarding-step-actions">
      <button className="onboarding-secondary-button" onClick={() => void onRunSync()} type="button">
        Run initial sync
      </button>
      <button className="onboarding-primary-button" disabled={progress < 100} onClick={onOpenInbox} type="button">
        Open inbox
      </button>
    </div>
  </section>
);
