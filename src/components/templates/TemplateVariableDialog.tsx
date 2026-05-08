import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

type TemplateVariableDialogProps = {
  templateTitle: string;
  variables: string[];
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
};

export const TemplateVariableDialog = ({
  templateTitle,
  variables,
  onApply,
  onClose
}: TemplateVariableDialogProps) => {
  const initialValues = useMemo(
    () => Object.fromEntries(variables.map((variable) => [variable, ''])),
    [variables]
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      aria-label="Template variables"
      aria-modal="true"
      className="composer-dialog-backdrop"
      onKeyDown={handleKeyDown}
      role="dialog"
    >
      <div className="composer-dialog">
        <div className="composer-dialog-header">
          <div>
            <strong>Fill template variables</strong>
            <p>{templateTitle}</p>
          </div>
          <button aria-label="Close template variables dialog" onClick={onClose} ref={closeButtonRef} type="button">
            Close
          </button>
        </div>
        <div className="template-variable-list">
          {variables.map((variable) => (
            <label className="preferences-field" key={variable}>
              <span>{variable}</span>
              <input
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [variable]: event.target.value
                  }))
                }
                placeholder={`Value for ${variable}`}
                value={values[variable] ?? ''}
              />
            </label>
          ))}
        </div>
        <div className="template-editor-actions">
          <button className="preferences-primary-button" onClick={() => onApply(values)} type="button">
            Apply template
          </button>
        </div>
      </div>
    </div>
  );
};
