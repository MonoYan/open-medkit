import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose, open]);

  if (!open) {
    return null;
  }

  const confirmClassName =
    tone === 'danger'
      ? 'border border-status-danger/30 bg-status-danger text-white hover:bg-status-danger/90'
      : 'border border-accent/30 bg-accent text-white hover:bg-accent-hover';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 animate-overlayFade bg-overlay/70 backdrop-blur-[2px]"
        onClick={() => {
          if (!loading) {
            onClose();
          }
        }}
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="theme-modal-shell animate-modalPop relative z-10 w-full max-w-[420px] rounded-[20px] border"
      >
        <div className="border-b border-border/40 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-danger-bg text-status-danger">
              <AlertTriangle aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <h3 id="confirm-dialog-title" className="text-[17px] font-semibold text-ink">
                {title}
              </h3>
              <p
                id="confirm-dialog-description"
                className="mt-1.5 text-[13px] leading-[1.65] text-ink2"
              >
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className="theme-button-neutral rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${confirmClassName}`}
          >
            {loading ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
