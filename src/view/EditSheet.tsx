import { useEffect, useState, type FormEvent } from "react";

export interface EditSheetProps {
  open: boolean;
  body: string;
  onCancel(): void;
  onSave(body: string): Promise<void>;
}

export function EditSheet({ open, body, onCancel, onSave }: EditSheetProps) {
  const [value, setValue] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(body);
      setError(null);
    }
  }, [body, open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="personal-stream-sheet-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <form className="personal-stream-edit-sheet" onSubmit={submit} aria-label="Edit stream entry">
        <div className="personal-stream-sheet-handle" />
        <h2>Edit Markdown</h2>
        <textarea
          autoFocus
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          rows={10}
          aria-label="Entry Markdown"
        />
        {error && <div className="personal-stream-inline-error">{error}</div>}
        <div className="personal-stream-sheet-actions">
          <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="submit" className="mod-cta" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
