import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { getComposerTextAlign, setComposerTextAlign } from '@lib/composer-text-align';

type ComposerToolbarProps = {
  editor: Editor | null;
  onAddInlineImages: (files: File[]) => void;
  onRequestLink: () => void;
};

export const ComposerToolbar = ({ editor, onAddInlineImages, onRequestLink }: ComposerToolbarProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!editor) {
    return null;
  }

  const isListItemActive = editor.isActive('bulletList') || editor.isActive('orderedList');
  const activeTextAlign = getComposerTextAlign(editor);
  const handleToolbarMouseDown = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  return (
    <div className="composer-toolbar" aria-label="Composer toolbar">
      <button
        aria-pressed={editor.isActive('bold')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Cmd+B)"
        type="button"
      >
        Bold
      </button>
      <button
        aria-pressed={editor.isActive('italic')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Cmd+I)"
        type="button"
      >
        Italic
      </button>
      <button
        aria-pressed={editor.isActive('underline')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Cmd+U)"
        type="button"
      >
        Underline
      </button>
      <button
        aria-pressed={editor.isActive('strike')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough (Cmd+Shift+S)"
        type="button"
      >
        Strike
      </button>
      <span>|</span>
      <button
        aria-pressed={editor.isActive('heading', { level: 1 })}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        type="button"
      >
        H1
      </button>
      <button
        aria-pressed={editor.isActive('heading', { level: 2 })}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        type="button"
      >
        H2
      </button>
      <button
        aria-pressed={editor.isActive('heading', { level: 3 })}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        type="button"
      >
        H3
      </button>
      <span>|</span>
      <button
        aria-pressed={editor.isActive('bulletList')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list (Cmd+Shift+8)"
        type="button"
      >
        Bullets
      </button>
      <button
        aria-pressed={editor.isActive('orderedList')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list (Cmd+Shift+7)"
        type="button"
      >
        Numbers
      </button>
      <button
        aria-disabled={!isListItemActive}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        title="Indent list item (Tab)"
        type="button"
      >
        Indent
      </button>
      <button
        aria-disabled={!isListItemActive}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        title="Outdent list item (Shift+Tab)"
        type="button"
      >
        Outdent
      </button>
      <button
        aria-pressed={editor.isActive('codeBlock')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block (Cmd+Shift+E)"
        type="button"
      >
        Code
      </button>
      <span>|</span>
      <button
        aria-pressed={editor.isActive('blockquote')}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        type="button"
      >
        Quote
      </button>
      <button
        onMouseDown={handleToolbarMouseDown}
        onClick={() => imageInputRef.current?.click()}
        title="Insert inline image"
        type="button"
      >
        Image
      </button>
      <input
        aria-label="Insert inline image"
        accept="image/*"
        hidden
        multiple
        onChange={(event) => {
          onAddInlineImages(Array.from(event.target.files ?? []));
          event.currentTarget.value = '';
        }}
        ref={imageInputRef}
        type="file"
      />
      <button
        aria-pressed={activeTextAlign === 'left'}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => setComposerTextAlign(editor, 'left')}
        title="Align left"
        type="button"
      >
        Left
      </button>
      <button
        aria-pressed={activeTextAlign === 'center'}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => setComposerTextAlign(editor, 'center')}
        title="Align center"
        type="button"
      >
        Center
      </button>
      <button
        aria-pressed={activeTextAlign === 'right'}
        onMouseDown={handleToolbarMouseDown}
        onClick={() => setComposerTextAlign(editor, 'right')}
        title="Align right"
        type="button"
      >
        Right
      </button>
      <button
        aria-pressed={editor.isActive('link')}
        onMouseDown={handleToolbarMouseDown}
        onClick={onRequestLink}
        title="Insert link (Cmd+K)"
        type="button"
      >
        Link
      </button>
    </div>
  );
};
