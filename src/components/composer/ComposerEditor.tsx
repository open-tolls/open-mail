import { useEffect } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { ComposerToolbar } from '@components/composer/ComposerToolbar';

type ComposerEditorProps = {
  body: string;
  onBodyChange: (value: string) => void;
};

const toInitialHtml = (body: string) => {
  if (!body.trim()) {
    return '<p></p>';
  }

  if (body.trim().startsWith('<')) {
    return body;
  }

  return `<p>${body}</p>`;
};

export const ComposerEditor = ({ body, onBodyChange }: ComposerEditorProps) => {
  const requestLink = (editorInstance = editor) => {
    if (!editorInstance) {
      return false;
    }

    const previousUrl = editorInstance.getAttributes('link').href as string | undefined;
    const nextUrl = window.prompt('Enter link URL', previousUrl ?? 'https://');

    if (nextUrl === null) {
      return true;
    }

    if (!nextUrl.trim()) {
      editorInstance.chain().unsetLink().run();
      return true;
    }

    editorInstance.chain().setLink({ href: nextUrl.trim() }).run();
    return true;
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2]
        }
      }),
      Placeholder.configure({
        placeholder: 'Write your message...'
      })
    ],
    content: toInitialHtml(body),
    editorProps: {
      attributes: {
        'aria-label': 'Message',
        class: 'composer-rich-editor',
        role: 'textbox'
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          return requestLink();
        }

        return false;
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      onBodyChange(currentEditor.getHTML());
    }
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextHtml = toInitialHtml(body);
    if (editor.getHTML() === nextHtml) {
      return;
    }

    editor.commands.setContent(nextHtml, {
      emitUpdate: false
    });
  }, [body, editor]);

  return (
    <div className="composer-editor-shell">
      <ComposerToolbar editor={editor} onRequestLink={() => requestLink()} />
      <div className="composer-editor-field">
        <span>Message</span>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
