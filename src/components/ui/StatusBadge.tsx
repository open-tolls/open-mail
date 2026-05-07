type StatusBadgeProps = {
  label: string;
  tone: 'success' | 'accent' | 'neutral' | 'warning';
};

export const StatusBadge = ({ label, tone }: StatusBadgeProps) => {
  return <span className={`status-badge status-badge-${tone}`}>{label}</span>;
};
