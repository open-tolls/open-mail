import type { ReactNode } from 'react';

type TooltipProps = {
  children: ReactNode;
  content: string;
};

export const Tooltip = ({ children, content }: TooltipProps) => (
  <span className="ui-tooltip" data-tooltip={content}>
    {children}
  </span>
);
