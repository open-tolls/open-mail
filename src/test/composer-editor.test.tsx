import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerEditor } from '@components/composer/ComposerEditor';
import { runComposerListIndentationShortcut } from '@lib/composer-editor-shortcuts';
import { getComposerTextAlign, setComposerTextAlign } from '@lib/composer-text-align';

if (!('getClientRects' in Text.prototype)) {
  Object.defineProperty(Text.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  });
}

if (!('getBoundingClientRect' in Text.prototype)) {
  Object.defineProperty(Text.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect()
  });
}

if (!('getClientRects' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  });
}

if (!('getBoundingClientRect' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect()
  });
}

if (!('getClientRects' in Range.prototype)) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => []
  });
}

if (!('getBoundingClientRect' in Range.prototype)) {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect()
  });
}

const focusEditorText = (value: string, collapseToStart = false) => {
  const editor = screen.getByRole('textbox', { name: 'Message' });
  const textWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let textNode: Node | null = textWalker.nextNode();

  while (textNode && !textNode.textContent?.includes(value)) {
    textNode = textWalker.nextNode();
  }

  if (!textNode?.textContent) {
    throw new Error(`Could not find text node containing "${value}"`);
  }

  const startIndex = textNode.textContent.indexOf(value);
  const range = document.createRange();
  range.setStart(textNode, startIndex);
  range.setEnd(textNode, collapseToStart ? startIndex : startIndex + value.length);

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
    expect(screen.getByRole('button', { name: 'H3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bullets' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Numbers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outdent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Center' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Right' })).toBeInTheDocument();
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

  it('surfaces the advanced shortcut affordances for strike, lists, and code blocks', () => {
    render(<ComposerEditor body="<p>Hello team</p>" onBodyChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Strike' })).toHaveAttribute('title', 'Strikethrough (Cmd+Shift+S)');
    expect(screen.getByRole('button', { name: 'Numbers' })).toHaveAttribute('title', 'Numbered list (Cmd+Shift+7)');
    expect(screen.getByRole('button', { name: 'Bullets' })).toHaveAttribute('title', 'Bullet list (Cmd+Shift+8)');
    expect(screen.getByRole('button', { name: 'Indent' })).toHaveAttribute('title', 'Indent list item (Tab)');
    expect(screen.getByRole('button', { name: 'Outdent' })).toHaveAttribute('title', 'Outdent list item (Shift+Tab)');
    expect(screen.getByRole('button', { name: 'Code' })).toHaveAttribute('title', 'Code block (Cmd+Shift+E)');
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('title', 'Align left');
    expect(screen.getByRole('button', { name: 'Center' })).toHaveAttribute('title', 'Align center');
    expect(screen.getByRole('button', { name: 'Right' })).toHaveAttribute('title', 'Align right');
  });

  it('routes Tab and Shift+Tab to nested list indentation commands', () => {
    const preventDefault = vi.fn();
    const sinkListItem = vi.fn(() => ({ run: () => true }));
    const liftListItem = vi.fn(() => ({ run: () => true }));
    const focus = vi.fn(() => ({
      sinkListItem,
      liftListItem
    }));
    const editor = {
      isActive: vi.fn((name: string) => name === 'bulletList'),
      chain: vi.fn(() => ({
        focus
      }))
    } as never;

    expect(
      runComposerListIndentationShortcut(
        {
          key: 'Tab',
          shiftKey: false,
          preventDefault
        } as unknown as KeyboardEvent,
        editor
      )
    ).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(sinkListItem).toHaveBeenCalledWith('listItem');

    expect(
      runComposerListIndentationShortcut(
        {
          key: 'Tab',
          shiftKey: true,
          preventDefault
        } as unknown as KeyboardEvent,
        editor
      )
    ).toBe(true);
    expect(liftListItem).toHaveBeenCalledWith('listItem');
  });

  it('applies text alignment through the toolbar helpers', () => {
    const updateAttributes = vi.fn(() => ({
      updateAttributes,
      run: () => true
    }));
    const focus = vi.fn(() => ({
      updateAttributes,
      run: () => true
    }));
    const editor = {
      chain: vi.fn(() => ({
        focus
      })),
      getAttributes: vi.fn((node: string) => {
        if (node === 'paragraph') {
          return { textAlign: 'center' };
        }

        return {};
      })
    } as never;

    expect(setComposerTextAlign(editor, 'right')).toBe(true);
    expect(updateAttributes).toHaveBeenNthCalledWith(1, 'paragraph', { textAlign: 'right' });
    expect(updateAttributes).toHaveBeenNthCalledWith(2, 'heading', { textAlign: 'right' });
    expect(getComposerTextAlign(editor)).toBe('center');
  });
});
