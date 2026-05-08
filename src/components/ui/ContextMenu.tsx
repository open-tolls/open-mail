import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './styles';

type ContextMenuProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(({ children, className, ...props }, ref) => (
  <div className={cx('ui-context-menu', className)} ref={ref} role="menu" {...props}>
    {children}
  </div>
));

ContextMenu.displayName = 'ContextMenu';
