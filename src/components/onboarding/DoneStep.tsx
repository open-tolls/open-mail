import { Link } from 'react-router';

type DoneStepProps = {
  onAddAnother: () => void;
};

export const DoneStep = ({ onAddAnother }: DoneStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">Done</p>
      <h2>You&apos;re all set</h2>
      <p>Your onboarding path is now wired end to end in the UI. The next cuts in phase 6 will replace the simulated bits with persisted accounts and live sync.</p>
    </div>

    <div className="onboarding-step-actions">
      <button className="onboarding-secondary-button" onClick={onAddAnother} type="button">
        Add another account
      </button>
      <Link className="onboarding-primary-link" to="/">
        Open inbox
      </Link>
    </div>
  </section>
);
