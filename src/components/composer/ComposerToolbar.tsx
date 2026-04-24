import type { Editor } from '@tiptap/react';

type ComposerToolbarProps = {
  editor: Editor | null;
  onRequestLink: () => void;
};

export const ComposerToolbar = ({ editor, onRequestLink }: ComposerToolbarProps) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="composer-toolbar" aria-label="Composer toolbar">
      <button
        aria-pressed={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Cmd+B)"
        type="button"
      >
        Bold
      </button>
      <button
        aria-pressed={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Cmd+I)"
        type="button"
      >
        Italic
      </button>
      <button
        aria-pressed={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Cmd+U)"
        type="button"
      >
        Underline
      </button>
      <button
        aria-pressed={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough (Cmd+Shift+S)"
        type="button"
      >
        Strike
      </button>
      <span>|</span>
      <button
        aria-pressed={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        type="button"
      >
        H1
      </button>
      <button
        aria-pressed={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        type="button"
      >
        H2
      </button>
      <button
        aria-pressed={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        type="button"
      >
        H3
      </button>
      <span>|</span>
      <button
        aria-pressed={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list (Cmd+Shift+8)"
        type="button"
      >
        Bullets
      </button>
      <button
        aria-pressed={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list (Cmd+Shift+7)"
        type="button"
      >
        Numbers
      </button>
      <button
        aria-pressed={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block (Cmd+Shift+E)"
        type="button"
      >
        Code
      </button>
      <span>|</span>
      <button
        aria-pressed={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        type="button"
      >
        Quote
      </button>
      <button
        aria-pressed={editor.isActive('link')}
        onClick={onRequestLink}
        title="Insert link (Cmd+K)"
        type="button"
      >
        Link
      </button>
    </div>
  );
};
