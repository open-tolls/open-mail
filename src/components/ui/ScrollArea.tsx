import type { HTMLAttributes } from 'react';
import { cx } from './styles';

export const ScrollArea = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cx('ui-scroll-area', className)} {...props} />
);
