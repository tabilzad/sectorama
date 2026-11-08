import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { RUNTIME_SETTINGS_DEFAULTS, type DriveAlertThreshold } from '@sectorama/shared';
import { useAlertThresholds, useUpdateAlertThreshold, useDeleteAlertThreshold } from '../../api/hooks/useNotifications';
import { useRuntimeSettings } from '../../api/hooks/useSettings';
import {
  TemperatureZoneEditor,
  validateZones,
  zonesFromDefaults,
  type TemperatureZones,
} from '../../components/temperature/TemperatureZoneEditor';

/** The drive's own zones, falling back to the global defaults for anything it does not override. */
function zonesForDrive(existing: DriveAlertThreshold | undefined, defaults: TemperatureZones): TemperatureZones {
  return {
    normal: existing?.tempNormalCelsius           ?? defaults.normal,
    warm:   existing?.tempWarmCelsius             ?? defaults.warm,
    alert:  existing?.temperatureThresholdCelsius ?? defaults.alert,
    tooHot: existing?.tempTooHotCelsius           ?? defaults.tooHot,
  };
}

export function DriveAlertSettings({ driveId }: { driveId: number }) {
  const { data: thresholds } = useAlertThresholds();
  const { data: runtime }    = useRuntimeSettings();
  const updateThreshold      = useUpdateAlertThreshold();
  const deleteThreshold      = useDeleteAlertThreshold();

  const existing = thresholds?.find(t => t.driveId === driveId);
  const defaults = useMemo(
    () => zonesFromDefaults(runtime?.settings.temperature ?? RUNTIME_SETTINGS_DEFAULTS.temperature),
    [runtime?.settings.temperature],
  );

  const [open,  setOpen]  = useState(false);
  // null = no local edits; show whatever the server says.
  const [draft, setDraft] = useState<TemperatureZones | null>(null);
  useEffect(() => setDraft(null), [existing, defaults]);

  const zones   = draft ?? zonesForDrive(existing, defaults);
  const isValid = validateZones(zones).length === 0;

  async function handleSave() {
    if (!isValid) return;
    await updateThreshold.mutateAsync({
      driveId,
      temperatureThresholdCelsius: zones.alert,
      tempNormalCelsius:  zones.normal,
      tempWarmCelsius:    zones.warm,
      tempTooHotCelsius:  zones.tooHot,
    });
    setDraft(null);
  }

  async function handleReset() {
    await deleteThreshold.mutateAsync(driveId);
    setDraft(null);
  }

  return (
    <div className="card mt-6">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Temperature Settings</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-200 text-gray-400">
            {existing ? 'Custom for this drive' : 'Using defaults'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="mt-5 space-y-5">
          <TemperatureZoneEditor value={zones} onChange={setDraft} />

          {/* ── Footer: alert note + actions ────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-surface-300">
            <p className="text-xs text-gray-600">
              ⚡ An alert fires when temperature rises above the{' '}
              <span className="text-amber-400/80">Warm→Hot</span> threshold ({zones.alert}°C).
              {existing
                ? <> Reset to follow the defaults from{' '}</>
                : <> These are the defaults from{' '}</>}
              <Link to="/settings" className="text-accent hover:text-accent-light transition-colors">Settings</Link>
              {'; channels are configured in '}
              <Link to="/notifications" className="text-accent hover:text-accent-light transition-colors">Notifications</Link>.
            </p>
            <div className="flex gap-2 ml-auto shrink-0">
              {existing && (
                <button
                  onClick={handleReset}
                  disabled={deleteThreshold.isPending}
                  className="text-xs text-gray-500 hover:text-gray-300 border border-surface-300
                             px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Reset to defaults
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!isValid || draft === null || updateThreshold.isPending}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {updateThreshold.isPending ? 'Saving…' : 'Save for this drive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
