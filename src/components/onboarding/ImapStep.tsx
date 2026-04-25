type ImapFormState = {
  displayName: string;
  email: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: 'SSL' | 'StartTLS' | 'None';
  password: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: 'SSL' | 'StartTLS' | 'None';
};

type ImapStepProps = {
  form: ImapFormState;
  onBack: () => void;
  onChange: <K extends keyof ImapFormState>(field: K, value: ImapFormState[K]) => void;
  onContinue: () => void;
};

const securityOptions: ImapFormState['imapSecurity'][] = ['SSL', 'StartTLS', 'None'];

export const ImapStep = ({ form, onBack, onChange, onContinue }: ImapStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">Manual IMAP</p>
      <h2>Configure your mail servers</h2>
      <p>Fill in incoming and outgoing settings. Known providers land here already prefilled so you only tweak what changed.</p>
    </div>

    <div className="onboarding-form-grid">
      <label className="onboarding-field">
        <span>Name</span>
        <input onChange={(event) => onChange('displayName', event.target.value)} type="text" value={form.displayName} />
      </label>
      <label className="onboarding-field">
        <span>Email</span>
        <input onChange={(event) => onChange('email', event.target.value)} type="email" value={form.email} />
      </label>
      <label className="onboarding-field onboarding-field-full">
        <span>Password</span>
        <input onChange={(event) => onChange('password', event.target.value)} type="password" value={form.password} />
      </label>
      <label className="onboarding-field onboarding-field-full">
        <span>IMAP server</span>
        <input onChange={(event) => onChange('imapHost', event.target.value)} type="text" value={form.imapHost} />
      </label>
      <label className="onboarding-field">
        <span>IMAP port</span>
        <input onChange={(event) => onChange('imapPort', event.target.value)} type="text" value={form.imapPort} />
      </label>
      <label className="onboarding-field">
        <span>IMAP security</span>
        <select onChange={(event) => onChange('imapSecurity', event.target.value as ImapFormState['imapSecurity'])} value={form.imapSecurity}>
          {securityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="onboarding-field onboarding-field-full">
        <span>SMTP server</span>
        <input onChange={(event) => onChange('smtpHost', event.target.value)} type="text" value={form.smtpHost} />
      </label>
      <label className="onboarding-field">
        <span>SMTP port</span>
        <input onChange={(event) => onChange('smtpPort', event.target.value)} type="text" value={form.smtpPort} />
      </label>
      <label className="onboarding-field">
        <span>SMTP security</span>
        <select onChange={(event) => onChange('smtpSecurity', event.target.value as ImapFormState['smtpSecurity'])} value={form.smtpSecurity}>
          {securityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>

    <div className="onboarding-step-actions">
      <button className="onboarding-secondary-button" onClick={onBack} type="button">
        Back
      </button>
      <button className="onboarding-primary-button" onClick={onContinue} type="button">
        Review connection
      </button>
    </div>
  </section>
);

export type { ImapFormState };
