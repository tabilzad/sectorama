export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div className={`inline-block ${sz} animate-spin rounded-full border-2 border-surface-300 border-t-accent`} />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-96">
      <LoadingSpinner size="lg" />
    </div>
  );
}
