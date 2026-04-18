import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { useShortcutStore } from '@stores/useShortcutStore';

describe('mailbox overview integration', () => {
  it('renders mailbox data in the shell', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /inbox/i })).toBeInTheDocument();
    expect(await screen.findByText('motion-notes.pdf')).toBeInTheDocument();
    expect((await screen.findAllByText('design-review')).length).toBeGreaterThan(0);
    expect(await screen.findByText('System folders')).toBeInTheDocument();
    expect(await screen.findByText('Custom folders')).toBeInTheDocument();
    expect(await screen.findByText('Labels')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Label design-review' })).toBeInTheDocument();
    expect(await screen.findByText('Active account')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('2 unread');
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Inbox');

    const folderNav = await screen.findByLabelText('Mailbox folders');
    fireEvent.click(within(folderNav).getByRole('button', { name: /starred/i }));
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
    expect(screen.queryByText('motion-notes.pdf')).not.toBeInTheDocument();
    expect((await screen.findAllByText('tauri-health')).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Starred');

    fireEvent.click(await screen.findByRole('button', { name: /sent/i }));
    expect(await screen.findByRole('heading', { name: 'Ship notes for desktop alpha' })).toBeInTheDocument();
    expect(await screen.findByText('release@example.com')).toBeInTheDocument();
    expect((await screen.findAllByText('desktop-alpha')).length).toBeGreaterThan(0);
    expect(window.location.pathname).toBe('/sent');

    fireEvent.click(within(folderNav).getByRole('button', { name: /archive/i }));
    expect(await screen.findByText('Archive is clear')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/archive');
  });

  it('filters threads through the shell search input', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const searchInput = await screen.findByRole('textbox');
    fireEvent.change(searchInput, { target: { value: 'rust' } });

    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();
    expect(await screen.findByText('Search results for "rust"')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Premium motion system approved' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'no-match-term' } });
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('supports phase 3 keyboard shortcuts for search, composer, and thread navigation', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const searchInput = await screen.findByRole('textbox');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(await screen.findByLabelText(/^to$/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText(/^to$/i)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'j' });
    expect(await screen.findByRole('heading', { name: 'Rust health-check online' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k' });
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
  });

  it('supports phase 3 thread action shortcuts with status feedback', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 's' });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Star shortcut queued: Premium motion system approved'
    );

    fireEvent.keyDown(window, { key: '#' });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Trash shortcut queued: Premium motion system approved'
    );

    fireEvent.keyDown(window, { key: 'r' });
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Reply shortcut queued: Premium motion system approved'
    );
  });

  it('persists custom phase 3 shortcut bindings', async () => {
    useShortcutStore.getState().setShortcutBinding('thread.star', 'x');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'x' });

    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent(
      'Star shortcut queued: Premium motion system approved'
    );
    expect(window.localStorage.getItem('open-mail-shortcuts')).toContain('"thread.star":"x"');
  });

  it('supports phase 3 mailbox number shortcuts', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(await screen.findByRole('heading', { name: 'Ship notes for desktop alpha' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Sent');

    fireEvent.keyDown(window, { key: '3', metaKey: true });
    expect(await screen.findByText('Drafts is clear')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Drafts');

    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(await screen.findByRole('heading', { name: 'Premium motion system approved' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Inbox');
  });

  it('hydrates mailbox selection from route params', async () => {
    window.history.pushState({}, '', '/sent/thr_3');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Ship notes for desktop alpha' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('Sent');
  });

  it('pushes selected threads into the browser route', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByText('Rust health-check online'));

    expect(window.location.pathname).toBe('/inbox/thr_2');
  });

  it('persists phase 3 layout mode through the toolbar toggle', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    const layoutToggle = await screen.findByRole('button', { name: /switch to list layout/i });
    fireEvent.click(layoutToggle);

    expect(await screen.findByRole('button', { name: /switch to split layout/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await screen.findByLabelText('Mailbox status')).toHaveTextContent('List layout');
    expect(window.localStorage.getItem('open-mail-ui')).toContain('"layoutMode":"list"');
  });

  it('cycles and persists phase 3 themes through the toolbar toggle', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /switch theme \(system\)/i }));

    expect(await screen.findByRole('button', { name: /switch theme \(dark\)/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('open-mail-ui')).toContain('"themeId":"dark"');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('queues a composed message from the shell', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /new message/i }));
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: 'review@example.com' } });
    fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: 'Review package' } });
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: 'This queued draft is ready for validation.' }
    });
    fireEvent.click(screen.getByRole('button', { name: /^queue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Queued 1 recipient(s)')).toBeInTheDocument();
    });
  });
});
