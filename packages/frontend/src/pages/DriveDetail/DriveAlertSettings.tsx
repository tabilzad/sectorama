import { useState, useEffect } from 'react';
import { useAlertThresholds, useUpdateAlertThreshold, useDeleteAlertThreshold } from '../../api/hooks/useNotifications';

const DEFAULT_TEMP_THRESHOLD = 55;

export function DriveAlertSettings({ driveId }: { driveId: number }) {
  const { data: thresholds } = useAlertThresholds();
  const updateThreshold      = useUpdateAlertThreshold();
  const deleteThreshold      = useDeleteAlertThreshold();

  const existing  = thresholds?.find(t => t.driveId === driveId);
  const serverVal = existing?.temperatureThresholdCelsius ?? DEFAULT_TEMP_THRESHOLD;
  const [value, setValue] = useState<number>(DEFAULT_TEMP_THRESHOLD);
  const [open, setOpen]   = useState(false);

  // Sync input when threshold data arrives from server
  useEffect(() => { setValue(serverVal); }, [serverVal]);

  const valueStr = String(value);

  async function handleSave() {
    await updateThreshold.mutateAsync({ driveId, temperatureThresholdCelsius: value });
  }

  async function handleReset() {
    await deleteThreshold.mutateAsync(driveId);
    // setValue will re-sync from serverVal (which becomes DEFAULT after delete + invalidate)
  }

  return (
    <div className="card mt-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-semibold text-white">Alert Settings</h3>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-400 shrink-0">Temperature threshold:</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={120}
                value={valueStr}
                onChange={e => setValue(parseInt(e.target.value, 10) || DEFAULT_TEMP_THRESHOLD)}
                className="w-20 bg-surface-200 border border-surface-300 rounded-lg px-3 py-1.5 text-sm
                           text-gray-200 text-center tabular-nums focus:outline-none focus:border-accent"
              />
              <span className="text-sm text-gray-500">°C</span>
            </div>
            <span className="text-xs text-gray-600">(global default: {DEFAULT_TEMP_THRESHOLD}°C)</span>
            <div className="flex gap-2 ml-auto">
              {existing && (
                <button
                  onClick={handleReset}
                  disabled={deleteThreshold.isPending}
                  className="text-xs text-gray-500 hover:text-gray-300 border border-surface-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Reset to default
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={updateThreshold.isPending}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {updateThreshold.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            An alert fires once when temperature transitions from at-or-below this threshold to above it.
            Configure notification channels in{' '}
            <a href="/notifications" className="text-accent hover:text-accent-light transition-colors">Notifications</a>.
          </p>
        </div>
      )}
    </div>
  );
}
