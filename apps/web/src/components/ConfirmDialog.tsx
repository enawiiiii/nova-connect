import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, loading = false, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [loading, onCancel, open]);

  if (!open) return null;
  return createPortal(
    <div className="moderation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onCancel(); }}>
      <section className="moderation-dialog glass-panel block-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <header><span className="moderation-icon block"><AlertTriangle /></span><div><small>NOVA / CONFIRM</small><h2 id="confirm-dialog-title">{title}</h2><p>{description}</p></div><button type="button" className="moderation-close" disabled={loading} onClick={onCancel} aria-label="إغلاق"><X /></button></header>
        <footer><button type="button" className="button button-ghost" disabled={loading} onClick={onCancel}>إلغاء</button><button type="button" className="button moderation-danger" disabled={loading} onClick={onConfirm}>{loading ? 'جارٍ التنفيذ…' : confirmLabel}</button></footer>
      </section>
    </div>,
    document.body,
  );
}
