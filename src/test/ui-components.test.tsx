import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Input,
  Kbd,
  Skeleton,
  Spinner,
  Switch,
  Tooltip
} from '@components/ui';

describe('ui components', () => {
  it('renders core controls with accessible labels', () => {
    render(
      <div>
        <Button>Archive</Button>
        <IconButton icon={<span aria-hidden="true">x</span>} label="Close" />
        <Input label="Search" name="search" />
        <Switch label="Dark mode" />
        <Tooltip content="Command palette">
          <Kbd>Cmd+K</Kbd>
        </Tooltip>
        <Badge tone="accent">Beta</Badge>
        <Avatar name="Leco Open Mail" />
        <Spinner />
        <Skeleton />
      </div>
    );

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Dark mode')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByLabelText('Leco Open Mail')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
