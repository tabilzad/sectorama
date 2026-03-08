import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LiveFeedEvent, SmartUpdatedEvent, BenchmarkCompletedEvent, DriveSummary } from '@sectorama/shared';

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
  const queryClient     = useQueryClient();
  const wsRef           = useRef<WebSocket | null>(null);
  // Distinguishes an initial connect from a reconnect after a dropout.
  const hasConnectedRef = useRef(false);
  // Debounce handle for the stats refetch that follows a burst of smart_updated events.
  const statsDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

      ws.onopen = () => {
        if (aborted) return;
        setConnected(true);

        // On reconnect (not initial connect) invalidate the two queries whose
        // updates are event-driven. This catches any events missed during the
        // disconnect window without needing a background polling interval.
        if (hasConnectedRef.current) {
          void queryClient.invalidateQueries({ queryKey: ['disks'] });
          void queryClient.invalidateQueries({ queryKey: ['stats'] });
        }
        hasConnectedRef.current = true;
      };

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

            // 1. Push the full SMART reading into its own cache key — zero HTTP.
            queryClient.setQueryData(['smart', event.driveId], event.reading);

            // 2. Surgically patch the affected drive inside the DriveSummary list.
            //    This avoids a full /disks refetch for every polled drive.
            //    The SMART poller emits one event per drive so N drives would
            //    otherwise cause N GET /disks calls; now it costs zero.
            queryClient.setQueryData<DriveSummary[]>(['disks'], prev =>
              prev?.map(d =>
                d.driveId === event.driveId
                  ? { ...d, health: event.health, temperature: event.temperature, lastSmartPoll: event.reading.timestamp }
                  : d,
              ),
            );

            // 3. Debounce the stats invalidation so the whole burst of N drives
            //    collapses into a single GET /stats once the burst settles.
            clearTimeout(statsDebounceRef.current);
            statsDebounceRef.current = setTimeout(() => {
              void queryClient.invalidateQueries({ queryKey: ['stats'] });
            }, 300);
          }

          if (event.type === 'benchmark_completed') {
            setLastBenchmarkDone(event);
            void queryClient.invalidateQueries({ queryKey: ['drive-benchmarks', event.driveId] });
            // ['disks'] includes lastBenchmarkRun per DriveSummary — update it now.
            void queryClient.invalidateQueries({ queryKey: ['disks'] });
            void queryClient.invalidateQueries({ queryKey: ['stats'] });
            // Invalidate run detail so chart fetches InfluxDB data now that it's fully written.
            void queryClient.invalidateQueries({ queryKey: ['benchmark-run', event.runId] });
            // Refresh the full series overlay now that a new run's data is in InfluxDB.
            void queryClient.invalidateQueries({ queryKey: ['drive-benchmark-series', event.driveId] });
            // Remove from active-benchmark-runs map.
            const prev = queryClient.getQueryData<Record<number, number>>(['active-benchmark-runs']) ?? {};
            const next = { ...prev };
            delete next[event.driveId];
            queryClient.setQueryData(['active-benchmark-runs'], next);
          }

          if (event.type === 'benchmark_failed') {
            // Look up driveId from reverse map since BenchmarkFailedEvent only has runId.
            const runMap = queryClient.getQueryData<Record<number, number>>(['run-id-to-drive-id']) ?? {};
            const driveId = runMap[event.runId];
            if (driveId != null) {
              void queryClient.invalidateQueries({ queryKey: ['drive-benchmarks', driveId] });
              const prev = queryClient.getQueryData<Record<number, number>>(['active-benchmark-runs']) ?? {};
              const next = { ...prev };
              delete next[driveId];
              queryClient.setQueryData(['active-benchmark-runs'], next);
            }
          }

          if (event.type === 'benchmark_started') {
            void queryClient.invalidateQueries({ queryKey: ['benchmark-run', event.runId] });
            // Track driveId → runId for dashboard card indicators.
            const prev = queryClient.getQueryData<Record<number, number>>(['active-benchmark-runs']) ?? {};
            queryClient.setQueryData(['active-benchmark-runs'], { ...prev, [event.driveId]: event.runId });
            // Reverse map: runId → driveId (needed to clean up on benchmark_failed).
            const prevMap = queryClient.getQueryData<Record<number, number>>(['run-id-to-drive-id']) ?? {};
            queryClient.setQueryData(['run-id-to-drive-id'], { ...prevMap, [event.runId]: event.driveId });
          }

          if (event.type === 'benchmark_progress') {
            // Store live progress in query cache so the progress bar can read it reactively.
            // Do NOT invalidate ['benchmark-run'] here — InfluxDB has no data yet during the run
            // and it would trigger one HTTP round-trip per point.
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
          // Ignore malformed messages.
        }
      };
    }

    connect();

    return () => {
      aborted = true;
      clearTimeout(reconnectTimer);
      clearTimeout(statsDebounceRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [queryClient]);

  return { connected, lastSmartEvent, lastBenchmarkDone };
}
