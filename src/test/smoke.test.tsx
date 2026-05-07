import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';

describe('App smoke test', () => {
  it('renders the Open Mail shell', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(screen.getByText('Open Mail')).toBeInTheDocument();
    expect(screen.getByText('Hello Open Mail')).toBeInTheDocument();
  });

  it('renders the isolated component gallery on the dev route', () => {
    window.history.pushState({}, '', '/dev');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(screen.getByRole('heading', { name: 'Open Mail UI primitives' })).toBeInTheDocument();
    expect(screen.getByLabelText('Component gallery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cycle theme' })).toBeInTheDocument();
  });

  it('renders onboarding outside the mailbox shell', () => {
    window.history.pushState({}, '', '/onboarding/account');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText('Open Mail onboarding')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bring the first account online without leaving the product.' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Mailbox folders')).not.toBeInTheDocument();
  });

  it('renders preferences outside the mailbox shell', () => {
    window.history.pushState({}, '', '/preferences');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText('Open Mail preferences')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Mailbox folders')).not.toBeInTheDocument();
  });

  it('surfaces offline mode in the mailbox shell when the browser connection drops', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    window.dispatchEvent(new Event('offline'));

    expect(await screen.findByLabelText('Offline mode banner')).toBeInTheDocument();
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    expect(await screen.findAllByText('Offline mode')).toHaveLength(2);

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true
    });
  });
});
