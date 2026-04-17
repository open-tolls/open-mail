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
});
