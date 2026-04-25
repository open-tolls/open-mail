import type { Editor } from '@tiptap/react';

export const getClipboardHtml = (clipboardData?: Pick<DataTransfer, 'getData'> | null) => {
  const html = clipboardData?.getData('text/html')?.trim() ?? '';
  return html.length ? html : null;
};

export const insertComposerHtmlPaste = (editor: Editor, html: string) =>
  editor.chain().focus().insertContent(html).run();
