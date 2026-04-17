import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './styles';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
};

export const IconButton = ({ className, icon, label, type = 'button', ...props }: IconButtonProps) => (
  <button
    aria-label={label}
    className={cx('ui-icon-button', className)}
    title={label}
    type={type}
    {...props}
  >
    {icon}
  </button>
);
