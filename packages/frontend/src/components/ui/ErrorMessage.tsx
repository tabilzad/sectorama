interface ErrorMessageProps {
  message?: string;
  retry?:   () => void;
}

export default function ErrorMessage({ message = 'An error occurred', retry }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-gray-400 max-w-sm">{message}</p>
      {retry && (
        <button onClick={retry} className="btn-ghost text-sm">
          Try again
        </button>
      )}
    </div>
  );
}
