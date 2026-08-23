import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';

// Generic create/edit form dialog driven by a field schema — used by every Academic
// Administration tab (Schools/Departments/Branches/Programs/Sessions/Classes) so each one
// doesn't need its own hand-written form. `fields`: [{ name, label, type: 'text'|'number'|
// 'select', required, options: [{value,label}] (for select) }].
export default function EntityFormDialog({ open, onOpenChange, title, description, fields, initialValues, onSubmit, submitLabel = 'Save' }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValues(initialValues || {});
      setError('');
    }
  }, [open, initialValues]);

  const handleChange = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !values[f.name]);
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {f.label}{f.required && <span className="text-destructive"> *</span>}
              </label>
              {f.type === 'select' ? (
                <select
                  value={values[f.name] ?? ''}
                  onChange={(e) => handleChange(f.name, e.target.value)}
                  disabled={f.disabled}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  <option value="">Select {f.label}...</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type || 'text'}
                  value={values[f.name] ?? ''}
                  onChange={(e) => handleChange(f.name, e.target.value)}
                  disabled={f.disabled}
                  placeholder={f.placeholder}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
