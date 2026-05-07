import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '@components/error/AppErrorBoundary';
import { SectionErrorBoundary } from '@components/error/SectionErrorBoundary';

const AlwaysCrashes = () => {
  throw new Error('boom');
};

describe('error boundaries', () => {
  it('renders the global fallback and reload action when the app crashes', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        assign
      }
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <AlwaysCrashes />
      </AppErrorBoundary>
    );

    expect(screen.getByLabelText('Open Mail error screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reload app' }));
    expect(assign).toHaveBeenCalledWith('/');

    consoleError.mockRestore();
  });

  it('keeps the shell alive with a section fallback and can retry a recoverable section', () => {
    let shouldCrash = true;
    const RecoveringComponent = () => {
      if (shouldCrash) {
        throw new Error('recoverable');
      }

      return <p>Recovered section</p>;
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <SectionErrorBoundary title="Thread list">
        <RecoveringComponent />
      </SectionErrorBoundary>
    );

    expect(screen.getByLabelText('Thread list fallback')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry section' })).toBeInTheDocument();

    shouldCrash = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry section' }));
    expect(screen.getByText('Recovered section')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
