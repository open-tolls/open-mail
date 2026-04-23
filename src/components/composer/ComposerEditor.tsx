type ComposerEditorProps = {
  body: string;
  onBodyChange: (value: string) => void;
};

export const ComposerEditor = ({ body, onBodyChange }: ComposerEditorProps) => (
  <div className="composer-editor-shell">
    <div className="composer-toolbar" aria-label="Composer toolbar">
      <button disabled type="button">
        Bold
      </button>
      <button disabled type="button">
        Italic
      </button>
      <button disabled type="button">
        Link
      </button>
      <span>Rich text lands next</span>
    </div>
    <label className="composer-editor-field">
      <span>Message</span>
      <textarea
        onChange={(event) => onBodyChange(event.target.value)}
        placeholder="Write your message..."
        rows={10}
        value={body}
      />
    </label>
  </div>
);
