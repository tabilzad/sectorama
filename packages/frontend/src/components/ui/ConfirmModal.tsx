interface ConfirmModalProps {
  open:          boolean;
  message:       string;
  confirmLabel?: string;
  onConfirm:     () => void;
  onCancel:      () => void;
}

export function ConfirmModal({
  open,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-surface-100 rounded-xl border border-surface-300 px-6 py-5
                      max-w-sm w-full mx-4 shadow-2xl">
        <p className="text-sm text-gray-200 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-danger/20 text-danger border border-danger/40
                       rounded-lg hover:bg-danger/30 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
