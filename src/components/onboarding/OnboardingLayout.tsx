import type { ReactNode } from 'react';
import openMailLogo from '@/assets/logo.svg';

type OnboardingLayoutProps = {
  children: ReactNode;
  currentStep: number;
  eyebrow: string;
  steps: { description: string; title: string }[];
  title: string;
};

export const OnboardingLayout = ({
  children,
  currentStep,
  eyebrow,
  steps,
  title
}: OnboardingLayoutProps) => (
  <main className="onboarding-root onboarding-root-phase-six" aria-label="Open Mail onboarding">
    <section className="onboarding-card onboarding-card-wizard">
      <div className="onboarding-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="onboarding-copy onboarding-copy-wizard">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <div className="onboarding-step-summary">
          <div className="onboarding-panel-header">
            <div className="brand-mark">
              <img alt="" src={openMailLogo} />
            </div>
            <div>
              <span>Open Mail setup</span>
              <strong>{steps.length} onboarding stages</strong>
            </div>
          </div>

          <ol className="onboarding-steps">
            {steps.map((step, index) => (
              <li
                className={index === currentStep ? 'onboarding-step-active' : index < currentStep ? 'onboarding-step-complete' : ''}
                key={step.title}
              >
                <div className="onboarding-step-index">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <span>Stage</span>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="onboarding-panel onboarding-panel-wizard">{children}</div>
    </section>
  </main>
);
