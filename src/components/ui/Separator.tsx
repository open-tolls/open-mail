import type { HTMLAttributes } from 'react';
import { cx } from './styles';

type SeparatorProps = HTMLAttributes<HTMLHRElement> & {
  orientation?: 'horizontal' | 'vertical';
};

export const Separator = ({
  className,
  orientation = 'horizontal',
  ...props
}: SeparatorProps) => (
  <hr
    aria-orientation={orientation}
    className={cx('ui-separator', `ui-separator-${orientation}`, className)}
    {...props}
  />
);
