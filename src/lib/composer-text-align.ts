import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

export type ComposerTextAlign = 'left' | 'center' | 'right';

export const composerTextAlign = Extension.create({
  name: 'composerTextAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['heading', 'paragraph'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => {
              const alignment = element.style.textAlign;
              return alignment === 'center' || alignment === 'right' ? alignment : null;
            },
            renderHTML: (attributes) => {
              if (!attributes.textAlign) {
                return {};
              }

              return {
                style: `text-align: ${attributes.textAlign}`
              };
            }
          }
        }
      }
    ];
  }
});

export const getComposerTextAlign = (editor: Editor): ComposerTextAlign => {
  const headingAlignment = editor.getAttributes('heading').textAlign;
  if (headingAlignment === 'center' || headingAlignment === 'right') {
    return headingAlignment;
  }

  const paragraphAlignment = editor.getAttributes('paragraph').textAlign;
  if (paragraphAlignment === 'center' || paragraphAlignment === 'right') {
    return paragraphAlignment;
  }

  return 'left';
};

export const setComposerTextAlign = (editor: Editor, alignment: ComposerTextAlign) => {
  const nextValue = alignment === 'left' ? null : alignment;

  return editor
    .chain()
    .focus()
    .updateAttributes('paragraph', { textAlign: nextValue })
    .updateAttributes('heading', { textAlign: nextValue })
    .run();
};
