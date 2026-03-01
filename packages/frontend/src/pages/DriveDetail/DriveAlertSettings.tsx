import { useState, useEffect } from 'react';
import { useAlertThresholds, useUpdateAlertThreshold, useDeleteAlertThreshold } from '../../api/hooks/useNotifications';

// ─── Zone palette (must stay in sync with SmartAttributeChart) ────────────────

export const ZONE_COLORS = {
  cold:   '#60a5fa',   // blue-400
  normal: '#4ade80',   // green-400
  warm:   '#fbbf24',   // amber-400
  hot:    '#fb923c',   // orange-400
  tooHot: '#f87171',   // red-400
} as const;

export const ZONE_DEFAULTS = { normal: 25, warm: 45, alert: 55, tooHot: 65 } as const;

// Maximum °C used to compute proportional widths in the preview bar.
const BAR_MAX = 90;

function barPct(from: number, to: number): string {
  return `${(Math.max(0, to - from) / BAR_MAX * 100).toFixed(1)}%`;
}

// ─── Input field ──────────────────────────────────────────────────────────────

function ZoneInput({
  label, dotColor, value, onChange, accent = false,
  badge,
}: {
  label:    string;
  dotColor: string;
  value:    number;
  onChange: (v: number) => void;
  accent?:  boolean;
  badge?:   React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs mb-1.5 flex items-center gap-1.5 flex-wrap">
        <span style={{ color: dotColor }}>■</span>
        <span className="text-gray-400">{label}</span>
        {badge}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={119}
          value={value}
          onChange={e => onChange(parseInt(e.target.value, 10) || 1)}
          className={`w-full rounded-lg px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none
            ${accent
              ? 'bg-surface-200 border border-amber-500/50 text-amber-300 focus:border-amber-400'
              : 'bg-surface-200 border border-surface-300 text-gray-200 focus:border-accent'
            }`}
        />
        <span className="text-xs text-gray-500 shrink-0">°C</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DriveAlertSettings({ driveId }: { driveId: number }) {
  const { data: thresholds } = useAlertThresholds();
  const updateThreshold      = useUpdateAlertThreshold();
  const deleteThreshold      = useDeleteAlertThreshold();

  const existing = thresholds?.find(t => t.driveId === driveId);

  const [open,   setOpen]   = useState(false);
  const [normal, setNormal] = useState<number>(ZONE_DEFAULTS.normal);
  const [warm,   setWarm]   = useState<number>(ZONE_DEFAULTS.warm);
  const [alert,  setAlert]  = useState<number>(ZONE_DEFAULTS.alert);
  const [tooHot, setTooHot] = useState<number>(ZONE_DEFAULTS.tooHot);

  // Sync local state when server data arrives
  useEffect(() => {
    setNormal(existing?.tempNormalCelsius  ?? ZONE_DEFAULTS.normal);
    setWarm(  existing?.tempWarmCelsius    ?? ZONE_DEFAULTS.warm);
    setAlert( existing?.temperatureThresholdCelsius ?? ZONE_DEFAULTS.alert);
    setTooHot(existing?.tempTooHotCelsius  ?? ZONE_DEFAULTS.tooHot);
  }, [existing]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors: string[] = [];
  if (!(normal > 0 && normal < warm))    errors.push('Cold→Normal must be > 0°C and < Normal→Warm');
  if (!(warm > normal && warm < alert))  errors.push('Normal→Warm must be between Cold→Normal and Alert threshold');
  if (!(alert > warm && alert < tooHot)) errors.push('Alert threshold must be between Normal→Warm and Hot→Too Hot');
  if (!(tooHot > alert && tooHot < 120)) errors.push('Hot→Too Hot must be between Alert threshold and 120°C');

  const isValid = errors.length === 0;

  // ── Zone bar data ───────────────────────────────────────────────────────────
  const zones = [
    { fill: ZONE_COLORS.cold,   label: 'Cold',    from: 0,      to: normal },
    { fill: ZONE_COLORS.normal, label: 'Normal',  from: normal, to: warm   },
    { fill: ZONE_COLORS.warm,   label: 'Warm',    from: warm,   to: alert  },
    { fill: ZONE_COLORS.hot,    label: 'Hot',     from: alert,  to: tooHot },
    { fill: ZONE_COLORS.tooHot, label: 'Too Hot', from: tooHot, to: BAR_MAX },
  ];

  const boundaries = [normal, warm, alert, tooHot];

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!isValid) return;
    await updateThreshold.mutateAsync({
      driveId,
      temperatureThresholdCelsius: alert,
      tempNormalCelsius:  normal,
      tempWarmCelsius:    warm,
      tempTooHotCelsius:  tooHot,
    });
  }

  async function handleReset() {
    await deleteThreshold.mutateAsync(driveId);
  }

  return (
    <div className="card mt-6">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-semibold text-white">Temperature Settings</h3>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="mt-5 space-y-5">

          {/* ── Zone preview bar ────────────────────────────────────────── */}
          <div>
            <p className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Zone preview</p>

            {/* Color bar */}
            <div className="flex h-8 rounded-lg overflow-hidden" style={{ gap: 1 }}>
              {zones.map(z => (
                <div
                  key={z.label}
                  style={{
                    width:           barPct(z.from, z.to),
                    backgroundColor: z.fill + '28',
                    borderTop:       `2px solid ${z.fill}70`,
                    transition:      'width 0.12s ease',
                  }}
                  className="flex items-center justify-center overflow-hidden min-w-0"
                >
                  <span
                    className="text-xs truncate px-1 select-none"
                    style={{ color: z.fill + 'cc' }}
                  >
                    {z.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Boundary tick labels */}
            <div className="relative h-5 mt-0.5 select-none">
              {boundaries.map((b, i) => (
                <span
                  key={i}
                  className="absolute text-xs text-gray-600 tabular-nums"
                  style={{ left: `${(b / BAR_MAX) * 100}%`, transform: 'translateX(-50%)' }}
                >
                  {b}°
                </span>
              ))}
            </div>
          </div>

          {/* ── Boundary inputs ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ZoneInput
              label="Cold → Normal"
              dotColor={ZONE_COLORS.cold}
              value={normal}
              onChange={setNormal}
            />
            <ZoneInput
              label="Normal → Warm"
              dotColor={ZONE_COLORS.normal}
              value={warm}
              onChange={setWarm}
            />
            <ZoneInput
              label="Warm → Hot"
              dotColor={ZONE_COLORS.hot}
              value={alert}
              onChange={setAlert}
              accent
              badge={
                <span className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: '#f59e0b18', color: '#fbbf24' }}>
                  ⚡ Alert
                </span>
              }
            />
            <ZoneInput
              label="Hot → Too Hot"
              dotColor={ZONE_COLORS.tooHot}
              value={tooHot}
              onChange={setTooHot}
            />
          </div>

          {/* ── Validation errors ────────────────────────────────────────── */}
          {errors.length > 0 && (
            <ul className="space-y-0.5">
              {errors.map(e => (
                <li key={e} className="text-xs text-danger flex items-start gap-1">
                  <span>·</span><span>{e}</span>
                </li>
              ))}
            </ul>
          )}

          {/* ── Footer: alert note + actions ────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-surface-300">
            <p className="text-xs text-gray-600">
              ⚡ An alert fires when temperature rises above the{' '}
              <span className="text-amber-400/80">Warm→Hot</span> threshold ({alert}°C).
              Configure channels in{' '}
              <a href="/notifications" className="text-accent hover:text-accent-light transition-colors">
                Notifications
              </a>.
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
                disabled={!isValid || updateThreshold.isPending}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {updateThreshold.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
