import type { ReactNode } from 'react';
import type { TemperatureDefaults } from '@sectorama/shared';

// ─── Zone palette (shared by the editor and SmartAttributeChart) ──────────────

export const ZONE_COLORS = {
  cold:   '#60a5fa',   // blue-400
  normal: '#4ade80',   // green-400
  warm:   '#fbbf24',   // amber-400
  hot:    '#fb923c',   // orange-400
  tooHot: '#f87171',   // red-400
} as const;

/** Zone boundaries in °C. `alert` is also the temperature alert threshold. */
export interface TemperatureZones {
  normal: number;   // Cold → Normal
  warm:   number;   // Normal → Warm
  alert:  number;   // Warm → Hot
  tooHot: number;   // Hot → Too Hot
}

export type ZoneKey = keyof TemperatureZones;

export function zonesFromDefaults(d: TemperatureDefaults): TemperatureZones {
  return { normal: d.normalCelsius, warm: d.warmCelsius, alert: d.alertCelsius, tooHot: d.tooHotCelsius };
}

export function zonesToDefaults(z: TemperatureZones): TemperatureDefaults {
  return { normalCelsius: z.normal, warmCelsius: z.warm, alertCelsius: z.alert, tooHotCelsius: z.tooHot };
}

export function zonesEqual(a: TemperatureZones, b: TemperatureZones): boolean {
  return a.normal === b.normal && a.warm === b.warm && a.alert === b.alert && a.tooHot === b.tooHot;
}

export function validateZones(z: TemperatureZones): string[] {
  const errors: string[] = [];
  if (!(z.normal > 0 && z.normal < z.warm))      errors.push('Cold→Normal must be > 0°C and < Normal→Warm');
  if (!(z.warm > z.normal && z.warm < z.alert))  errors.push('Normal→Warm must be between Cold→Normal and the alert threshold');
  if (!(z.alert > z.warm && z.alert < z.tooHot)) errors.push('Alert threshold must be between Normal→Warm and Hot→Too Hot');
  if (!(z.tooHot > z.alert && z.tooHot < 120))   errors.push('Hot→Too Hot must be between the alert threshold and 120°C');
  return errors;
}

// Maximum °C used to compute proportional widths in the preview bar.
const BAR_MAX = 90;

function barPct(from: number, to: number): string {
  return `${(Math.max(0, to - from) / BAR_MAX * 100).toFixed(1)}%`;
}

// ─── Input field ──────────────────────────────────────────────────────────────

function ZoneInput({
  label, dotColor, value, onChange, accent = false, badge, disabled, lockedBy,
}: {
  label:     string;
  dotColor:  string;
  value:     number;
  onChange:  (v: number) => void;
  accent?:   boolean;
  badge?:    ReactNode;
  disabled?: boolean;
  /** Environment variable that pins this value; renders the field read-only with a note. */
  lockedBy?: string;
}) {
  const readOnly = disabled || !!lockedBy;
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
          disabled={readOnly}
          aria-label={label}
          onChange={e => onChange(parseInt(e.target.value, 10) || 1)}
          className={`w-full rounded-lg px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none
            disabled:opacity-60 disabled:cursor-not-allowed
            ${accent
              ? 'bg-surface-200 border border-amber-500/50 text-amber-300 focus:border-amber-400'
              : 'bg-surface-200 border border-surface-300 text-gray-200 focus:border-accent'
            }`}
        />
        <span className="text-xs text-gray-500 shrink-0">°C</span>
      </div>
      {lockedBy && (
        <p className="mt-1 text-[11px] text-gray-500">
          Set by <code className="text-gray-400">{lockedBy}</code>
        </p>
      )}
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

interface TemperatureZoneEditorProps {
  value:     TemperatureZones;
  onChange:  (next: TemperatureZones) => void;
  disabled?: boolean;
  /** Fields pinned by the environment, keyed by zone, with the variable name. */
  lockedBy?: Partial<Record<ZoneKey, string>>;
}

/** Zone preview bar, the four boundary inputs and the validation messages. Stateless: the parent owns the values. */
export function TemperatureZoneEditor({ value, onChange, disabled, lockedBy = {} }: TemperatureZoneEditorProps) {
  const errors = validateZones(value);
  const set = (key: ZoneKey) => (v: number) => onChange({ ...value, [key]: v });

  const zones = [
    { fill: ZONE_COLORS.cold,   label: 'Cold',    from: 0,            to: value.normal },
    { fill: ZONE_COLORS.normal, label: 'Normal',  from: value.normal, to: value.warm   },
    { fill: ZONE_COLORS.warm,   label: 'Warm',    from: value.warm,   to: value.alert  },
    { fill: ZONE_COLORS.hot,    label: 'Hot',     from: value.alert,  to: value.tooHot },
    { fill: ZONE_COLORS.tooHot, label: 'Too Hot', from: value.tooHot, to: BAR_MAX      },
  ];
  const boundaries = [value.normal, value.warm, value.alert, value.tooHot];

  return (
    <div className="space-y-5">
      {/* ── Zone preview bar ────────────────────────────────────────────── */}
      <div>
        <p className="text-xs text-gray-600 mb-2 uppercase tracking-wide">Zone preview</p>

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
              <span className="text-xs truncate px-1 select-none" style={{ color: z.fill + 'cc' }}>
                {z.label}
              </span>
            </div>
          ))}
        </div>

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

      {/* ── Boundary inputs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ZoneInput label="Cold → Normal" dotColor={ZONE_COLORS.cold}   value={value.normal} onChange={set('normal')} disabled={disabled} lockedBy={lockedBy.normal} />
        <ZoneInput label="Normal → Warm" dotColor={ZONE_COLORS.normal} value={value.warm}   onChange={set('warm')}   disabled={disabled} lockedBy={lockedBy.warm} />
        <ZoneInput
          label="Warm → Hot"
          dotColor={ZONE_COLORS.hot}
          value={value.alert}
          onChange={set('alert')}
          disabled={disabled}
          lockedBy={lockedBy.alert}
          accent
          badge={
            <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f59e0b18', color: '#fbbf24' }}>
              ⚡ Alert
            </span>
          }
        />
        <ZoneInput label="Hot → Too Hot" dotColor={ZONE_COLORS.tooHot} value={value.tooHot} onChange={set('tooHot')} disabled={disabled} lockedBy={lockedBy.tooHot} />
      </div>

      {/* ── Validation errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <ul className="space-y-0.5">
          {errors.map(e => (
            <li key={e} className="text-xs text-danger flex items-start gap-1">
              <span>·</span><span>{e}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
