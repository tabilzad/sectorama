import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LiveFeedEvent, SmartUpdatedEvent, BenchmarkCompletedEvent } from '@sectorama/shared';

export interface BenchmarkProgressState {
  pointIndex:  number;
  totalPoints: number;
  speedBps:    number;
  phase?:      'curve' | 'profiles';
  phaseLabel?: string;
}

export interface LiveFeedState {
  connected:          boolean;
  lastSmartEvent:     SmartUpdatedEvent | null;
  lastBenchmarkDone:  BenchmarkCompletedEvent | null;
}

const WS_URL = (() => {
  const base = import.meta.env.VITE_API_BASE_URL ?? '';
  if (base) {
    return base.replace(/^http/, 'ws') + '/ws/live-feed';
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/live-feed`;
})();

export function useLiveFeed(): LiveFeedState {
  const queryClient = useQueryClient();
  const wsRef       = useRef<WebSocket | null>(null);
  const [connected,         setConnected]         = useState(false);
  const [lastSmartEvent,    setLastSmartEvent]     = useState<SmartUpdatedEvent | null>(null);
  const [lastBenchmarkDone, setLastBenchmarkDone] = useState<BenchmarkCompletedEvent | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let aborted = false;

    function connect() {
      if (aborted) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen  = () => { if (!aborted) setConnected(true); };
      ws.onclose = () => {
        if (aborted) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 5_000);
      };
      ws.onerror = () => { ws.close(); };
      ws.onmessage = (ev) => {
        if (aborted) return;
        try {
          const event: LiveFeedEvent = JSON.parse(ev.data as string);

          if (event.type === 'smart_updated') {
            setLastSmartEvent(event);
            void queryClient.invalidateQueries({ queryKey: ['disks'] });
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
          }

          if (event.type === 'benchmark_completed') {
            setLastBenchmarkDone(event);
            void queryClient.invalidateQueries({ queryKey: ['drive-benchmarks', event.driveId] });
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
            // Invalidate run detail so chart fetches InfluxDB data now that it's fully written
            void queryClient.invalidateQueries({ queryKey: ['benchmark-run', event.runId] });
            // Refresh the full series overlay now that a new run's data is in InfluxDB
            void queryClient.invalidateQueries({ queryKey: ['drive-benchmark-series', event.driveId] });
          }

          if (event.type === 'benchmark_started') {
            void queryClient.invalidateQueries({ queryKey: ['benchmark-run', event.runId] });
          }

          if (event.type === 'benchmark_progress') {
            // Store live progress in query cache so the progress bar can read it reactively.
            // Do NOT invalidate ['benchmark-run'] here — InfluxDB has no data yet during the run
            // and it would trigger one HTTP round-trip per point (11 wasted calls).
            queryClient.setQueryData<BenchmarkProgressState>(
              ['benchmark-progress', event.runId],
              {
                pointIndex:  event.pointIndex,
                totalPoints: event.totalPoints,
                speedBps:    event.speedBps,
                phase:       event.phase,
                phaseLabel:  event.phaseLabel,
              },
            );
          }

          if (event.type === 'disk_detected' || event.type === 'disk_removed') {
            void queryClient.invalidateQueries({ queryKey: ['disks'] });
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
          }
        } catch {
          // Ignore malformed messages
        }
      };
    }

    connect();

    return () => {
      aborted = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [queryClient]);

  return { connected, lastSmartEvent, lastBenchmarkDone };
}
