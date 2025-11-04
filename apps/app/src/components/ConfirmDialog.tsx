import React, { useEffect } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div
        className="relative bg-[var(--nt-bg-primary)] border border-[var(--nt-border)] rounded-lg shadow-lg
                   w-full max-w-[calc(100%-2rem)] sm:max-w-lg
                   animate-in zoom-in-95 fade-in duration-200"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <h2
            id="dialog-title"
            className="text-lg font-semibold text-[var(--nt-text)]"
          >
            {title}
          </h2>
          <p
            id="dialog-description"
            className="mt-2 text-sm text-[var(--nt-text-muted)]"
          >
            {description}
          </p>
        </div>

        {/* Footer with buttons */}
        <div className="flex flex-col-reverse gap-2 p-6 pt-2 sm:flex-row sm:justify-end sm:gap-2">
          <button
            onClick={handleCancel}
            className="min-h-[44px] sm:min-h-[40px] px-4 py-2
                     border border-[var(--nt-border)] bg-transparent text-[var(--nt-text)]
                     rounded hover:bg-[var(--nt-bg-secondary)] transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded font-medium transition-colors
                       focus:outline-none focus:ring-2 focus:ring-offset-2
                       ${
                         destructive
                           ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-600'
                           : 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-600'
                       }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
