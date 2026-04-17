import type { HTMLAttributes } from 'react';
import { cx } from './styles';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'success' | 'accent' | 'danger';
};

export const Badge = ({ className, tone = 'neutral', ...props }: BadgeProps) => (
  <span className={cx('ui-badge', `ui-badge-${tone}`, className)} {...props} />
);
