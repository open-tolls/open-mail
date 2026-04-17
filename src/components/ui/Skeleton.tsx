import type { HTMLAttributes } from 'react';
import { cx } from './styles';

export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden="true" className={cx('ui-skeleton', className)} {...props} />
);
