import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';

describe('onboarding flow', () => {
  it('walks through welcome, provider selection, setup, test, sync, and done', async () => {
    window.history.pushState({}, '', '/onboarding/account');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.click(screen.getByRole('button', { name: /Other IMAP/i }));

    expect(screen.getByRole('heading', { name: 'Configure your mail servers' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Leco' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'leco@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('IMAP server'), { target: { value: 'imap.example.com' } });
    fireEvent.change(screen.getByLabelText('SMTP server'), { target: { value: 'smtp.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));

    expect(screen.getByRole('heading', { name: 'Validate the account before syncing' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run checks' }));
    await screen.findAllByText('Ready');
    expect(screen.getByRole('button', { name: 'Continue to sync' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to sync' }));
    expect(screen.getByRole('heading', { name: 'Warm up the inbox' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run initial sync' }));
    expect(await screen.findByRole('heading', { name: "You're all set" })).toBeInTheDocument();
  });
});
