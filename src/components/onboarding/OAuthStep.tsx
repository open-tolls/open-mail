type OAuthStepProps = {
  authUrl: string | null;
  clientId: string;
  providerName: string;
  status: string | null;
  onBack: () => void;
  onClientIdChange: (value: string) => void;
  onContinue: () => void;
  onPrepare: () => Promise<void> | void;
};

export const OAuthStep = ({
  authUrl,
  clientId,
  providerName,
  status,
  onBack,
  onClientIdChange,
  onContinue,
  onPrepare
}: OAuthStepProps) => (
  <section className="onboarding-step-screen">
    <div className="onboarding-step-copy">
      <p className="eyebrow">OAuth</p>
      <h2>Authorize {providerName}</h2>
      <p>
        Use the native browser flow for {providerName}. This first cut prepares the authorization URL and keeps the
        callback path ready for the deeper account setup we will keep expanding in phase 6.
      </p>
    </div>

    <label className="onboarding-field">
      <span>{providerName} client ID</span>
      <input
        onChange={(event) => onClientIdChange(event.target.value)}
        placeholder="Paste the OAuth client id"
        type="text"
        value={clientId}
      />
    </label>

    {status ? <p className="onboarding-inline-status">{status}</p> : null}
    {authUrl ? (
      <div className="onboarding-auth-preview">
        <span>Authorization URL prepared</span>
        <code>{authUrl}</code>
      </div>
    ) : null}

    <div className="onboarding-step-actions">
      <button className="onboarding-secondary-button" onClick={onBack} type="button">
        Back
      </button>
      <button className="onboarding-secondary-button" onClick={() => void onPrepare()} type="button">
        Prepare browser auth
      </button>
      <button className="onboarding-primary-button" disabled={!authUrl} onClick={onContinue} type="button">
        Continue
      </button>
    </div>
  </section>
);
