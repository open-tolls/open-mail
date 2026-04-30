import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { useAccountStore } from '@stores/useAccountStore';
import { useUIStore } from '@stores/useUIStore';

describe('preferences view', () => {
  it('renders all seven preference sections on the dedicated route', async () => {
    window.history.pushState({}, '', '/preferences');
    useAccountStore.setState({
      accounts: [
        {
          id: 'acc_demo',
          provider: 'Gmail',
          email: 'leco@example.com',
          displayName: 'Open Mail Demo'
        }
      ],
      selectedAccountId: 'acc_demo'
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Signatures' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shortcuts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeInTheDocument();
  });

  it('applies theme and layout changes immediately from preferences', async () => {
    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /parchment/i }));
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'list' } });
    expect(useUIStore.getState().layoutMode).toBe('list');
  });
});
