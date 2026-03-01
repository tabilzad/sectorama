import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceArea,
} from 'recharts';
import { ZONE_COLORS, ZONE_DEFAULTS } from '../../pages/DriveDetail/DriveAlertSettings';

// ─── Temperature zone config ──────────────────────────────────────────────────

/** Per-drive zone threshold config. All values in °C. */
export interface TempZoneConfig {
  normal: number;   // Cold → Normal
  warm:   number;   // Normal → Warm
  hot:    number;   // Warm → Hot  (= alert threshold)
  tooHot: number;   // Hot → Too Hot
}

export const DEFAULT_ZONE_CONFIG: TempZoneConfig = {
  normal: ZONE_DEFAULTS.normal,
  warm:   ZONE_DEFAULTS.warm,
  hot:    ZONE_DEFAULTS.alert,
  tooHot: ZONE_DEFAULTS.tooHot,
};

interface TempZoneDef { min: number; max: number; label: string; fill: string; }

function buildZones(cfg: TempZoneConfig): TempZoneDef[] {
  return [
    { min: 0,         max: cfg.normal, label: 'Cold',    fill: ZONE_COLORS.cold   },
    { min: cfg.normal, max: cfg.warm,  label: 'Normal',  fill: ZONE_COLORS.normal },
    { min: cfg.warm,   max: cfg.hot,   label: 'Warm',    fill: ZONE_COLORS.warm   },
    { min: cfg.hot,    max: cfg.tooHot,label: 'Hot',     fill: ZONE_COLORS.hot    },
    { min: cfg.tooHot, max: 130,       label: 'Too Hot', fill: ZONE_COLORS.tooHot },
  ];
}

type TempZone = TempZoneDef;

/**
 * Matches any standard SMART temperature attribute name across ATA and NVMe drives.
 * Examples: "temperature", "Temperature_Celsius", "Airflow_Temperature_Cel", "Temp_C"
 */
function isTemperatureAttr(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'temperature' || lower.includes('temperature') || /temp[_\s]?c/i.test(name);
}

function getTempZone(value: number, zones: TempZoneDef[]): TempZone | undefined {
  return zones.find(z => value >= z.min && value < z.max);
}

// ─── Density-adaptive rendering ───────────────────────────────────────────────

function getDotConfig(count: number, color: string) {
  if (count < 30)  return { dot: { fill: color, r: 3, strokeWidth: 0 }, strokeWidth: 2,   activeDot: { r: 5, strokeWidth: 0 } };
  if (count < 80)  return { dot: { fill: color, r: 1, strokeWidth: 0 }, strokeWidth: 1.8, activeDot: { r: 4, strokeWidth: 0 } };
  return             { dot: false as const,                              strokeWidth: 1.5, activeDot: { r: 4, strokeWidth: 0 } };
}

/** Reduce X-axis tick density so labels never overlap regardless of data volume */
function xTickInterval(count: number): number | 'preserveStartEnd' {
  if (count <= 12)  return 0;                           // show all
  if (count <= 48)  return Math.floor(count / 8);       // ~8 labels
  if (count <= 288) return Math.floor(count / 6);       // ~6 labels
  return Math.floor(count / 5);                         // ~5 labels for very dense data
}

// ─── Types & helpers ──────────────────────────────────────────────────────────

interface SmartPoint {
  timestamp: string;
  value:     number;
  rawValue:  number;
}

interface SmartAttributeChartProps {
  points:      SmartPoint[];
  attrName:    string;
  height?:     number;
  /** Per-drive zone thresholds. Falls back to DEFAULT_ZONE_CONFIG when omitted. */
  zoneConfig?: TempZoneConfig;
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

interface TooltipPayload { dataKey: string; value: number; name: string; color: string; }

interface ChartTooltipProps {
  active?:  boolean;
  payload?: TooltipPayload[];
  label?:   string;
  isTemp:   boolean;
  zones:    TempZoneDef[];
}

function ChartTooltip({ active, payload, label, isTemp, zones }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1a1a24', border: '1px solid #333345', borderRadius: 6, padding: '8px 12px', minWidth: 160 }}>
      <p className="text-xs text-gray-500 mb-2">{label ? formatDate(label) : ''}</p>
      {payload.map(p => {
        // Raw value is meaningless for temperature (always 0 from smart_readings)
        if (isTemp && p.dataKey === 'rawValue') return null;

        if (isTemp) {
          const zone = getTempZone(p.value, zones);
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span
                className="font-mono text-base font-semibold"
                style={{ color: zone?.fill ?? '#e2e8f0' }}
              >
                {p.value}°C
              </span>
              {zone && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: zone.fill + '26', color: zone.fill }}
                >
                  {zone.label}
                </span>
              )}
            </div>
          );
        }

        return (
          <div key={p.dataKey} className="flex items-center gap-1.5 text-xs mb-0.5">
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.color, flexShrink: 0 }} />
            <span className="text-gray-400">{p.name}:</span>
            <span className="text-gray-200 font-mono ml-auto pl-2">{p.value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const VALUE_COLOR = '#2b908f';
const RAW_COLOR   = '#7798BF';
// Unique IDs so multiple chart instances on the same page don't share gradients
const GRAD_VALUE  = 'smartGradValue';
const GRAD_TEMP   = 'smartGradTemp';

export default function SmartAttributeChart({ points, attrName, height = 300, zoneConfig }: SmartAttributeChartProps) {
  if (!points.length) {
    return <p className="text-gray-500 text-sm py-8 text-center">No history data yet.</p>;
  }

  const isTemp  = isTemperatureAttr(attrName);
  const count   = points.length;
  const data    = points.map(p => ({ time: p.timestamp, value: p.value, rawValue: p.rawValue }));
  const cfg     = zoneConfig ?? DEFAULT_ZONE_CONFIG;
  const zones   = buildZones(cfg);

  // Temperature: anchor Y so zone bands are always contextually useful
  let yDomain: [number, number] | undefined;
  if (isTemp) {
    const vals  = points.map(p => p.value);
    const dMin  = Math.min(...vals);
    const dMax  = Math.max(...vals);
    yDomain = [Math.min(dMin - 3, cfg.normal - 5), Math.max(dMax + 5, cfg.warm + 10)];
  }

  const dotCfg    = getDotConfig(count, VALUE_COLOR);
  const tickGap   = xTickInterval(count);
  const gradId    = isTemp ? GRAD_TEMP : GRAD_VALUE;
  // Area fill opacity: lower for temperature so zone bands remain the primary color signal
  const areaOpTop = isTemp ? 0.12 : 0.28;
  const areaOpBot = isTemp ? 0.01 : 0.03;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          {attrName} — {count.toLocaleString()} data point{count !== 1 ? 's' : ''}
        </p>
        {count > 80 && (
          <p className="text-xs text-gray-600">
            {count > 288 ? 'High density — dots hidden for clarity' : 'Dots reduced for clarity'}
          </p>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 50, left: 20 }}>

          {/* Gradient definitions */}
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={VALUE_COLOR} stopOpacity={areaOpTop} />
              <stop offset="95%" stopColor={VALUE_COLOR} stopOpacity={areaOpBot} />
            </linearGradient>
          </defs>

          {/* Temperature zone bands — drawn before grid so grid sits on top */}
          {isTemp && zones.map(zone => (
            <ReferenceArea
              key={zone.label}
              y1={zone.min}
              y2={zone.max}
              fill={zone.fill}
              fillOpacity={0.12}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
          ))}

          <CartesianGrid strokeDasharray="3 3" stroke="#27273a" />

          <XAxis
            dataKey="time"
            tickFormatter={formatDate}
            stroke="#444"
            tick={{ fill: '#777', fontSize: 10 }}
            angle={-30}
            textAnchor="end"
            interval={tickGap}
            minTickGap={50}
          />
          <YAxis
            stroke="#444"
            tick={{ fill: '#777', fontSize: 11 }}
            domain={yDomain}
            unit={isTemp ? '°' : undefined}
            width={45}
          />

          <Tooltip
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as ChartTooltipProps['payload']}
                label={props.label as string | undefined}
                isTemp={isTemp}
                zones={zones}
              />
            )}
          />

          {!isTemp && (
            <Legend
              verticalAlign="top"
              wrapperStyle={{ color: '#888', fontSize: 12, paddingBottom: 8 }}
            />
          )}

          {/* Primary metric — area with gradient fill */}
          <Area
            type="monotone"
            dataKey="value"
            name={isTemp ? 'Temperature' : 'Value'}
            stroke={VALUE_COLOR}
            strokeWidth={dotCfg.strokeWidth}
            fill={`url(#${gradId})`}
            dot={dotCfg.dot}
            activeDot={dotCfg.activeDot}
            isAnimationActive={false}
          />

          {/* Raw value — dashed line only, no fill, non-temperature only */}
          {!isTemp && (
            <Line
              type="monotone"
              dataKey="rawValue"
              name="Raw"
              stroke={RAW_COLOR}
              strokeWidth={1.2}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Temperature zone key */}
      {isTemp && (
        <div className="flex gap-1.5 mt-3">
          {zones.map(z => (
            <div
              key={z.label}
              className="flex-1 text-center py-1.5 rounded text-xs font-medium"
              style={{
                backgroundColor: z.fill + '1a',
                color:            z.fill,
                border:          `1px solid ${z.fill}35`,
              }}
            >
              <div>{z.label}</div>
              <div className="font-normal opacity-60" style={{ fontSize: 10 }}>
                {z.min === 0
                  ? `< ${z.max}°C`
                  : z.max === 130
                  ? `> ${z.min}°C`
                  : `${z.min}–${z.max}°C`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
