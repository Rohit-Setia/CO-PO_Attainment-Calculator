import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// eslint-disable-next-line react-refresh/only-export-components -- hook lives alongside the Toast component it drives
export function useToast() {
  const [toast, setToast] = useState(null);

  const show = (message, type = 'info') => setToast({ message, type });
  const dismiss = () => setToast(null);

  return { toast, show, dismiss };
}

export function Toast({ message, type = 'info', onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onDismiss?.(), 2200);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  const palette = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    error: 'border-red-500/30 bg-red-500/10 text-red-200',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    info: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200',
  };

  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${palette[type] || palette.info}`}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="rounded-md p-1 text-current/80 hover:bg-black/5 hover:text-current">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
