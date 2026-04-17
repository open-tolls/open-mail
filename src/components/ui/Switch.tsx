import type { InputHTMLAttributes } from 'react';
import { cx } from './styles';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

export const Switch = ({ className, label, ...props }: SwitchProps) => (
  <label className={cx('ui-switch', className)}>
    <input type="checkbox" {...props} />
    <span aria-hidden="true" className="ui-switch-track">
      <span className="ui-switch-thumb" />
    </span>
    <span>{label}</span>
  </label>
);
