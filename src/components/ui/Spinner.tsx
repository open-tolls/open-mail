import type { HTMLAttributes } from 'react';
import { cx } from './styles';

export const Spinner = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span aria-label="Loading" className={cx('ui-spinner', className)} role="status" {...props} />
);
