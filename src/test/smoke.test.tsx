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
});

