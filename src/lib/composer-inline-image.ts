import { Node } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

export const composerInlineImage = Node.create({
  name: 'composerInlineImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: {
        default: null
      },
      alt: {
        default: null
      },
      title: {
        default: null
      }
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', HTMLAttributes];
  }
});

export const getImageFiles = (files: Iterable<File>) =>
  Array.from(files).filter((file) => file.type.startsWith('image/'));

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read image file')));
    reader.readAsDataURL(file);
  });

export const insertComposerInlineImages = async (editor: Editor, files: File[]) => {
  const imageFiles = getImageFiles(files);

  if (!imageFiles.length) {
    return false;
  }

  const images = await Promise.all(
    imageFiles.map(async (file) => ({
      type: 'composerInlineImage',
      attrs: {
        src: await fileToDataUrl(file),
        alt: file.name,
        title: file.name
      }
    }))
  );

  return editor.chain().focus().insertContent(images).run();
};
