import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';

describe('mailbox overview integration', () => {
  it('renders mailbox data in the shell', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Premium motion system approved')).toBeInTheDocument();
    expect(await screen.findByText('Inbox')).toBeInTheDocument();
  });
});
