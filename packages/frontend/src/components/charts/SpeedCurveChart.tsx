import { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { BenchmarkSeries } from '@sectorama/shared';
import { formatSpeed } from '../../lib/formatBytes';

function seriesOpacity(count: number): number {
  if (count <= 5)   return 0.90;
  if (count <= 20)  return 0.60;
  if (count <= 100) return 0.30;
  return 0.15;
}

const PALETTE = [
  '#2b908f', '#90ee7e', '#f45b5b', '#7798BF', '#aaeeee',
  '#ff0066', '#eeaaee', '#55BF3B', '#DF5353', '#7798BF',
];

interface SpeedCurveChartProps {
  series:  BenchmarkSeries[];
  height?: number;
}

interface ChartPoint {
  spot: number;
  [key: string]: number;
}

function formatRunDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

export default function SpeedCurveChart({ series, height = 380 }: SpeedCurveChartProps) {
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const toggle = useCallback((runId: number) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId); else next.add(runId);
      return next;
    });
  }, []);

  const showAll  = useCallback(() => setHidden(new Set()), []);
  const hideAll  = useCallback(() => setHidden(new Set(series.map(r => r.runId))), [series]);

  if (!series.length) return null;

  // Stable color per run — index in series array (newest-first)
  const colorMap = new Map(series.map((run, idx) => [run.runId, PALETTE[idx % PALETTE.length]]));

  const visibleSeries = series.filter(r => !hidden.has(r.runId));

  const spotMap = new Map<number, ChartPoint>();
  for (const run of visibleSeries) {
    for (const { spot, speed } of run.points) {
      if (!spotMap.has(spot)) spotMap.set(spot, { spot });
      spotMap.get(spot)![`r${run.runId}`] = speed;
    }
  }
  const data    = Array.from(spotMap.values()).sort((a, b) => a.spot - b.spot);
  const opacity = seriesOpacity(visibleSeries.length);

  const formatXAxis = (val: number) => {
    const gb = val / 1_000_000_000;
    return gb < 1 ? `${Math.round(val / 1_000_000)} MB` : `${gb.toFixed(0)} GB`;
  };
  const formatYAxis = (val: number) => `${(val / 1_000_000).toFixed(0)}`;

  const allHidden = hidden.size === series.length;
  const noneHidden = hidden.size === 0;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">
          {series.length.toLocaleString()} run{series.length !== 1 ? 's' : ''} — Y-axis: MB/s, X-axis: disk position
        </p>
        {series.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={showAll}
              disabled={noneHidden}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              Show all
            </button>
            <button
              onClick={hideAll}
              disabled={allHidden}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              Hide all
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {series.map(run => {
          const color    = colorMap.get(run.runId)!;
          const isHidden = hidden.has(run.runId);
          return (
            <button
              key={run.runId}
              onClick={() => toggle(run.runId)}
              title={isHidden ? 'Click to show' : 'Click to hide'}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-opacity ${
                isHidden
                  ? 'opacity-35 border-gray-700 bg-transparent'
                  : 'border-gray-600 bg-gray-800/40'
              }`}
            >
              <span
                className="inline-block rounded-sm flex-shrink-0"
                style={{ width: 20, height: 3, backgroundColor: color }}
              />
              <span className={isHidden ? 'line-through text-gray-500' : 'text-gray-300'}>
                {formatRunDate(run.startedAt)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      {visibleSeries.length > 0 ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333345" />
            <XAxis
              dataKey="spot"
              tickFormatter={formatXAxis}
              stroke="#666"
              tick={{ fill: '#999', fontSize: 11 }}
              label={{ value: 'Disk Position', position: 'insideBottom', offset: -10, fill: '#666', fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatYAxis}
              stroke="#666"
              tick={{ fill: '#999', fontSize: 11 }}
              label={{ value: 'MB/s', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a24', border: '1px solid #333345', borderRadius: 6 }}
              labelStyle={{ color: '#999' }}
              itemStyle={{ display: 'none' }}
              formatter={(_value, _name, props) => {
                const speed = Object.entries(props.payload)
                  .filter(([k, v]) => k !== 'spot' && typeof v === 'number' && v > 0)
                  .map(([, v]) => formatSpeed(v as number))
                  .join(', ');
                return [speed, ''];
              }}
              labelFormatter={val => `Position: ${formatXAxis(val as number)}`}
            />
            {visibleSeries.map(run => (
              <Line
                key={run.runId}
                type="monotone"
                dataKey={`r${run.runId}`}
                stroke={colorMap.get(run.runId)}
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                strokeOpacity={opacity}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div
          className="flex items-center justify-center text-gray-600 text-sm rounded border border-gray-800"
          style={{ height }}
        >
          All runs hidden — click a legend item to show it
        </div>
      )}

      <p className="text-xs text-gray-600 mt-2 text-center">
        Tight groupings = consistent performance. Dips = degraded media.
      </p>
    </div>
  );
}
