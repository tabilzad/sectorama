import { useState } from 'react';
import { useCommunitySharingEnabled, useSetCommunitySharingEnabled } from '@/api/hooks/useSettings';
import { useToast } from '@/hooks/useToast.ts';
import { Toast } from '../../components/ui/Toast';
import { FullPageSpinner } from '../../components/ui/LoadingSpinner';
import ErrorMessage from '../../components/ui/ErrorMessage';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const SHARED_CATEGORIES = [
  { label: 'OS & environment', detail: 'OS type/arch, RAM, fio version, app version' },
  { label: 'Drive identity',   detail: 'Vendor, model, firmware, capacity, interface type' },
  { label: 'SMART scalars',    detail: 'Power-on hours, temperature, reallocated sectors, health status' },
  { label: 'SMART attributes', detail: 'All polled ATA / NVMe attributes with raw values' },
  { label: 'Benchmark results', detail: 'Full position curve + 4 fio profile metrics per run' },
];

export default function SettingsPage() {
  const { data, isLoading, isError, refetch } = useCommunitySharingEnabled();
  const setSharing = useSetCommunitySharingEnabled();
  const { toast, showToast, dismissToast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (isLoading) return <FullPageSpinner />;
  if (isError)   return <ErrorMessage message="Could not load settings." retry={refetch} />;

  const enabled = data?.enabled ?? false;

  async function handleToggle() {
    const next = !enabled;
    await setSharing.mutateAsync(next);
    showToast(
      {
        title: 'Settings saved',
        body: `Community data sharing ${next ? 'enabled' : 'disabled'}.`,
        level: 'ok',
      },
      3000,
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Community Data Sharing card */}
      <div className="rounded-xl border border-surface-300 bg-surface-100 p-6 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-white">Community Data Sharing</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-200 text-gray-400">
                Off by default
              </span>
            </div>
            <p className="text-sm text-gray-400">
              Anonymously contribute benchmark and SMART data to a public database for cross-vendor
              and cross-model comparisons.
            </p>
          </div>

          {/* Toggle */}
          <button
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            disabled={setSharing.isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand
              ${enabled ? 'bg-brand' : 'bg-surface-300'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
                transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>

        {/* Privacy note */}
        <p className="text-xs text-gray-500">
          Serial numbers are one-way hashed (SHA-256, 16 hex chars). No personally identifiable
          data is transmitted.
        </p>

        {/* Expandable "What's shared" section */}
        <div className="border-t border-surface-300 pt-3">
          <button
            onClick={() => setDetailsOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <ChevronIcon open={detailsOpen} />
            What's shared
          </button>

          {detailsOpen && (
            <ul className="mt-3 space-y-2">
              {SHARED_CATEGORIES.map(c => (
                <li key={c.label} className="flex gap-2 text-xs">
                  <span className="shrink-0 font-medium text-gray-300 w-36">{c.label}</span>
                  <span className="text-gray-500">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast} onDismiss={dismissToast} />}
    </div>
  );
}
