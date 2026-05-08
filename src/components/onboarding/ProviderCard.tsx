import type { LucideIcon } from 'lucide-react';

type ProviderCardProps = {
  description: string;
  icon: LucideIcon;
  isRecommended?: boolean;
  name: string;
  onClick: () => void;
};

export const ProviderCard = ({
  description,
  icon: Icon,
  isRecommended = false,
  name,
  onClick
}: ProviderCardProps) => (
  <button aria-label={`Choose ${name}${isRecommended ? ', recommended provider' : ' provider'}`} className="provider-card" onClick={onClick} type="button">
    <div className="provider-card-icon">
      <Icon size={20} />
    </div>
    <div className="provider-card-copy">
      <strong>{name}</strong>
      <p>{description}</p>
    </div>
    {isRecommended ? <span className="provider-card-badge">Recommended</span> : null}
  </button>
);
