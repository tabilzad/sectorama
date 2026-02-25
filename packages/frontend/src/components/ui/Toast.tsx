import type { ToastMsg } from '@/hooks/useToast.ts';

export function Toast({ msg, onDismiss }: { msg: ToastMsg; onDismiss: () => void }) {
  const titleClass  = msg.level === 'error' ? 'text-danger'
                    : msg.level === 'ok'    ? 'text-brand'
                    :                         'text-accent';
  const borderClass = msg.level === 'error' ? 'border-danger/50'
                    : msg.level === 'ok'    ? 'border-brand/40'
                    :                         'border-accent/40';
  return (
    <div className={`fixed top-16 right-4 z-50 max-w-xs bg-surface-100 rounded-lg px-4 py-3
                     text-sm shadow-lg border flex items-start gap-3 animate-fade-in ${borderClass}`}>
      <div className="flex-1">
        <p className={`font-medium ${titleClass}`}>{msg.title}</p>
        {msg.body && <p className="text-gray-400 mt-0.5 text-xs">{msg.body}</p>}
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-600 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
        aria-label="Dismiss"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  );
}
