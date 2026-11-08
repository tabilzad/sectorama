import { useState } from 'react';
import {
  useCommunitySharingEnabled,
  useSetCommunitySharingEnabled,
  useSmartPollingSettings,
  useSetSmartPollingSettings,
} from '@/api/hooks/useSettings';
import { useToast } from '@/hooks/useToast.ts';
import { Toast } from '../../components/ui/Toast';
import ToggleSwitch from '../../components/ui/ToggleSwitch';
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
  const sharing      = useCommunitySharingEnabled();
  const setSharing   = useSetCommunitySharingEnabled();
  const polling      = useSmartPollingSettings();
  const setPolling   = useSetSmartPollingSettings();
  const { toast, showToast, dismissToast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (sharing.isLoading || polling.isLoading) return <FullPageSpinner />;
  if (sharing.isError) return <ErrorMessage message="Could not load settings." retry={sharing.refetch} />;
  if (polling.isError) return <ErrorMessage message="Could not load settings." retry={polling.refetch} />;

  const sharingEnabled = sharing.data?.enabled ?? false;
  const skipStandby    = polling.data?.skipStandby ?? true;

  async function handleToggleSharing() {
    const next = !sharingEnabled;
    try {
      await setSharing.mutateAsync(next);
      showToast({ title: 'Settings saved', body: `Community data sharing ${next ? 'enabled' : 'disabled'}.`, level: 'ok' }, 3000);
    } catch (err) {
      showToast({ title: 'Could not save settings', body: err instanceof Error ? err.message : 'Unknown error', level: 'error' });
    }
  }

  async function handleToggleStandby() {
    const next = !skipStandby;
    try {
      await setPolling.mutateAsync({ skipStandby: next });
      showToast(
        {
          title: 'Settings saved',
          body:  next ? 'Drives in standby are skipped during SMART polls.' : 'SMART polls now wake drives in standby.',
          level: 'ok',
        },
        3000,
      );
    } catch (err) {
      showToast({ title: 'Could not save settings', body: err instanceof Error ? err.message : 'Unknown error', level: 'error' });
    }
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="space-y-6">
        {/* SMART polling card */}
        <div className="rounded-xl border border-surface-300 bg-surface-100 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-white">Skip drives in standby</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-200 text-gray-400">
                  On by default
                </span>
              </div>
              <p className="text-sm text-gray-400">
                SMART polls leave sleeping disks alone, so monitoring is never the reason a drive spins up.
                A skipped drive keeps its last reading on the dashboard until it wakes on its own.
              </p>
            </div>
            <ToggleSwitch
              checked={skipStandby}
              onChange={handleToggleStandby}
              disabled={setPolling.isPending}
              label="Skip drives in standby during SMART polls"
            />
          </div>
          <p className="text-xs text-gray-500">
            Turn this off if you want a fresh reading every interval regardless of power state, for example on
            drives that never spin down. Changes apply from the next poll.
          </p>
        </div>

        {/* Community Data Sharing card */}
        <div className="rounded-xl border border-surface-300 bg-surface-100 p-6 space-y-4">
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
            <ToggleSwitch
              checked={sharingEnabled}
              onChange={handleToggleSharing}
              disabled={setSharing.isPending}
              label="Community data sharing"
            />
          </div>

          <p className="text-xs text-gray-500">
            Serial numbers are one-way hashed (SHA-256, 16 hex chars). No personally identifiable
            data is transmitted.
          </p>

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
      </div>

      {toast && <Toast msg={toast} onDismiss={dismissToast} />}
    </div>
  );
}
