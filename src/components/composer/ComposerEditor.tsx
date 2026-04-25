import { useEffect } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { ComposerToolbar } from '@components/composer/ComposerToolbar';
import { runComposerListIndentationShortcut } from '@lib/composer-editor-shortcuts';
import { composerInlineImage, getImageFiles, insertComposerInlineImages } from '@lib/composer-inline-image';
import { composerTextAlign } from '@lib/composer-text-align';

type ComposerEditorProps = {
  body: string;
  onBodyChange: (value: string) => void;
};

type EditorInstance = ReturnType<typeof useEditor>;

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
  const runEditorShortcut = (event: KeyboardEvent, editorInstance?: EditorInstance): boolean => {
    const resolvedEditor = editorInstance ?? editor;

    if (!resolvedEditor || !(event.metaKey || event.ctrlKey) || !event.shiftKey) {
      return false;
    }

    switch (event.key) {
      case '7':
        event.preventDefault();
        return resolvedEditor.chain().toggleOrderedList().run();
      case '8':
        event.preventDefault();
        return resolvedEditor.chain().toggleBulletList().run();
      case 'E':
      case 'e':
        event.preventDefault();
        return resolvedEditor.chain().toggleCodeBlock().run();
      case 'S':
      case 's':
        event.preventDefault();
        return resolvedEditor.chain().toggleStrike().run();
      default:
        return false;
    }
  };

  const requestLink = (editorInstance?: EditorInstance): boolean => {
    const resolvedEditor = editorInstance ?? editor;

    if (!resolvedEditor) {
      return false;
    }

    const previousUrl = resolvedEditor.getAttributes('link').href as string | undefined;
    const nextUrl = window.prompt('Enter link URL', previousUrl ?? 'https://');

    if (nextUrl === null) {
      return true;
    }

    if (!nextUrl.trim()) {
      resolvedEditor.chain().unsetLink().run();
      return true;
    }

    resolvedEditor.chain().setLink({ href: nextUrl.trim() }).run();
    return true;
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      composerTextAlign,
      composerInlineImage,
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
      handleKeyDown: (_view, event): boolean => {
        if (runComposerListIndentationShortcut(event, editor ?? undefined)) {
          return true;
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          return requestLink();
        }

        if (runEditorShortcut(event)) {
          return true;
        }

        return false;
      },
      handlePaste: (_view, event): boolean => {
        const imageFiles = getImageFiles(Array.from(event.clipboardData?.files ?? []));
        if (!editor || !imageFiles.length) {
          return false;
        }

        event.preventDefault();
        void insertComposerInlineImages(editor, imageFiles);
        return true;
      },
      handleDrop: (_view, event): boolean => {
        const imageFiles = getImageFiles(Array.from(event.dataTransfer?.files ?? []));
        if (!editor || !imageFiles.length) {
          return false;
        }

        event.preventDefault();
        void insertComposerInlineImages(editor, imageFiles);
        return true;
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
      <ComposerToolbar
        editor={editor}
        onAddInlineImages={(files) => {
          if (!editor) {
            return;
          }

          void insertComposerInlineImages(editor, files);
        }}
        onRequestLink={() => requestLink()}
      />
      <div className="composer-editor-field">
        <span>Message</span>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
