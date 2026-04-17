import type { ReactNode } from 'react';

type DropdownProps = {
  trigger: ReactNode;
  children: ReactNode;
};

export const Dropdown = ({ children, trigger }: DropdownProps) => (
  <details className="ui-dropdown">
    <summary>{trigger}</summary>
    <div className="ui-dropdown-content">{children}</div>
  </details>
);
