import type { InputHTMLAttributes } from 'react';
import { cx } from './styles';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export const Input = ({ className, hint, id, label, ...props }: InputProps) => {
  const inputId = id ?? props.name;
  const hintId = hint && inputId ? `${inputId}-hint` : undefined;

  return (
    <label className="ui-field">
      {label ? <span className="ui-field-label">{label}</span> : null}
      <input
        aria-describedby={hintId}
        className={cx('ui-input', className)}
        id={inputId}
        {...props}
      />
      {hint ? (
        <span className="ui-field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </label>
  );
};
