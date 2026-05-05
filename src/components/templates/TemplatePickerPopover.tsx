import type { EmailTemplate } from '@stores/useTemplateStore';

type TemplatePickerPopoverProps = {
  templates: EmailTemplate[];
  onClose: () => void;
  onSelect: (templateId: string) => void;
};

export const TemplatePickerPopover = ({ templates, onClose, onSelect }: TemplatePickerPopoverProps) => (
  <div aria-label="Template picker" className="composer-dialog-backdrop" role="dialog">
    <div className="composer-dialog">
      <div className="composer-dialog-header">
        <div>
          <strong>Templates</strong>
          <p>Choose a reusable message for this composer.</p>
        </div>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
      <div className="template-picker-list">
        {templates.length ? (
          templates.map((template) => (
            <button className="template-picker-item" key={template.id} onClick={() => onSelect(template.id)} type="button">
              <strong>{template.title}</strong>
              <span>{template.subject || 'No subject override'}</span>
              {template.variables.length ? (
                <small>{template.variables.map((variable) => `{{${variable}}}`).join(', ')}</small>
              ) : (
                <small>No variables</small>
              )}
            </button>
          ))
        ) : (
          <p className="preferences-note">No matching templates for this account yet.</p>
        )}
      </div>
    </div>
  </div>
);
