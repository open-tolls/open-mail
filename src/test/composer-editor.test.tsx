import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerEditor } from '@components/composer/ComposerEditor';

const focusEditorText = (value: string) => {
  const editor = screen.getByRole('textbox', { name: 'Message' });
  const textNode = Array.from(editor.childNodes)
    .flatMap((node) => Array.from(node.childNodes))
    .find((node) => node.textContent?.includes(value));

  if (!textNode?.textContent) {
    throw new Error(`Could not find text node containing "${value}"`);
  }

  Object.defineProperty(textNode, 'getClientRects', {
    configurable: true,
    value: () => []
  });
  Object.defineProperty(textNode, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect()
  });

  const startIndex = textNode.textContent.indexOf(value);
  const range = document.createRange();
  range.setStart(textNode, startIndex);
  range.setEnd(textNode, startIndex + value.length);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.focus(editor);

  return editor;
};

describe('ComposerEditor', () => {
  it('renders the TipTap editor surface with the expanded formatting toolbar', () => {
    render(<ComposerEditor body="<p>Hello team</p>" onBodyChange={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Strike' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'H1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'H2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bullets' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
  });

  it('surfaces editor shortcuts in the toolbar affordances', () => {
    render(<ComposerEditor body="<p>Hello team</p>" onBodyChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('title', 'Bold (Cmd+B)');
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute('title', 'Italic (Cmd+I)');
    expect(screen.getByRole('button', { name: 'Underline' })).toHaveAttribute('title', 'Underline (Cmd+U)');
    expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('title', 'Insert link (Cmd+K)');
  });

  it('syncs external body updates into the TipTap editor', async () => {
    const { rerender } = render(<ComposerEditor body="<p>Hello team</p>" onBodyChange={vi.fn()} />);

    rerender(<ComposerEditor body="<p>Updated body</p>" onBodyChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('Updated body');
    });
  });

  it('opens the link prompt from the toolbar and the Cmd+K shortcut', () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    render(<ComposerEditor body="<p>Hello team</p>" onBodyChange={vi.fn()} />);

    const editor = focusEditorText('Hello');
    promptSpy.mockReturnValue('https://example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    expect(promptSpy).toHaveBeenNthCalledWith(1, 'Enter link URL', 'https://');

    fireEvent.keyDown(editor, { key: 'k', metaKey: true });

    expect(promptSpy).toHaveBeenNthCalledWith(2, 'Enter link URL', 'https://example.com');
  });
});
