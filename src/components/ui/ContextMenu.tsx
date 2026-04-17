import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './styles';

type ContextMenuProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const ContextMenu = ({ children, className, ...props }: ContextMenuProps) => (
  <div className={cx('ui-context-menu', className)} role="menu" {...props}>
    {children}
  </div>
);
