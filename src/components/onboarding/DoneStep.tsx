import { Link } from 'react-router';

type DoneStepProps = {
  onAddAnother: () => void;
};

export const DoneStep = ({ onAddAnother }: DoneStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">Done</p>
      <h2>You&apos;re all set</h2>
      <p>Your account is saved and the inbox worker is ready. OAuth still needs the callback/token exchange cut, but the manual IMAP path now lands in the real desktop backend.</p>
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
