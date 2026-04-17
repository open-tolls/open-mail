import type { ButtonHTMLAttributes } from 'react';
import { cx } from './styles';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = ({
  className,
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) => (
  <button
    className={cx('ui-button', `ui-button-${variant}`, `ui-button-${size}`, className)}
    type={type}
    {...props}
  />
);
