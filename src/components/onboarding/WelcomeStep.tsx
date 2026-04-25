type WelcomeStepProps = {
  onContinue: () => void;
};

export const WelcomeStep = ({ onContinue }: WelcomeStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">Welcome</p>
      <h2>Welcome to Open Mail</h2>
      <p>
        Add your first email account to unlock sync, the composer, signatures, notifications, and everything else we
        finished in the previous phases.
      </p>
    </div>

    <div className="onboarding-step-actions">
      <button className="onboarding-primary-button" onClick={onContinue} type="button">
        Get started
      </button>
    </div>
  </section>
);
