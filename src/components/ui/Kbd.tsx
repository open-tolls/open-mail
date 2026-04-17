import type { HTMLAttributes } from 'react';
import { cx } from './styles';

export const Kbd = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <kbd className={cx('ui-kbd', className)} {...props} />
);
