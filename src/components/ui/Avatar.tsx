import type { HTMLAttributes } from 'react';
import { cx } from './styles';

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  src?: string | null;
};

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const Avatar = ({ className, name, src, ...props }: AvatarProps) => (
  <div aria-label={name} className={cx('ui-avatar', className)} {...props}>
    {src ? <img alt="" src={src} /> : <span>{initialsFor(name)}</span>}
  </div>
);
