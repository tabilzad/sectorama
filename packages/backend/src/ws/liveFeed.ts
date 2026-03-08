import type { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import type { LiveFeedEvent, SmartUpdatedEvent } from '@sectorama/shared';

/** All currently-connected live-feed WebSocket clients */
const clients = new Set<WebSocket>();

/**
 * Last benchmark_progress event broadcast, if a benchmark is currently running.
 * Sent to newly-connecting clients so they can restore the progress bar on refresh.
 * Cleared when benchmark_completed or benchmark_failed is broadcast.
 */
let activeProgress: LiveFeedEvent | null = null;

/**
 * Last smart_updated event per drive.
 * Replayed to newly-connecting clients so they get current SMART data immediately
 * without needing to wait for the next scheduled poll or make an HTTP request.
 */
const lastSmartByDrive = new Map<number, SmartUpdatedEvent>();

/**
 * Seed the replay map from the SQLite cache on startup.
 * Call this once after the warm-up completes so clients connecting before the
 * first scheduled poll still receive the last-known readings.
 */
export function initSmartReplay(events: SmartUpdatedEvent[]): void {
  for (const event of events) {
    lastSmartByDrive.set(event.driveId, event);
  }
}

/**
 * How often to send a WebSocket ping frame (ms).
 * Must be shorter than any proxy/NAT idle-connection timeout in the path.
 * 30 s is well under the typical 60–90 s NAT/proxy idle cutoff.
 */
const HEARTBEAT_INTERVAL_MS = 45_000;

/** Register the WebSocket route — call once during server setup */
export function registerLiveFeed(app: FastifyInstance): void {
  app.get('/ws/live-feed', { websocket: true }, (socket) => {
    clients.add(socket);

    // ── Heartbeat ──────────────────────────────────────────────────────────
    // Send a protocol-level ping frame every HEARTBEAT_INTERVAL_MS.
    // The browser WebSocket implementation responds with a pong automatically
    // at the protocol level — no JS code is needed on the client side.
    // Tracking isAlive lets us detect and evict truly dead connections
    // (e.g. a client that crashed without sending a close frame).
    let isAlive = true;

    socket.on('pong', () => { isAlive = true; });

    const heartbeat = setInterval(() => {
      if (!isAlive) {
        // Pong was not received since the last ping — connection is dead.
        clearInterval(heartbeat);
        socket.terminate();
        return;
      }
      isAlive = false;
      socket.ping();
    }, HEARTBEAT_INTERVAL_MS);

    socket.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(socket);
    });

    socket.on('error', () => {
      clearInterval(heartbeat);
      clients.delete(socket);
    });

    // Send a welcome message so the client knows it is connected
    socket.send(JSON.stringify({ type: 'connected', clientCount: clients.size }));

    // Replay the last known SMART reading for every drive so the client
    // gets current data immediately without an HTTP round-trip.
    for (const event of lastSmartByDrive.values()) {
      socket.send(JSON.stringify(event));
    }

    // If a benchmark is in progress, replay the last known progress event so the
    // client can restore the progress bar without waiting for the next tick.
    if (activeProgress) {
      socket.send(JSON.stringify(activeProgress));
    }
  });
}

/** Broadcast an event to all connected clients */
export function broadcast(event: LiveFeedEvent): void {
  // Track the last SMART reading per drive for on-connect replay.
  if (event.type === 'smart_updated') {
    lastSmartByDrive.set(event.driveId, event);
  }

  // Track the last progress event so new connections can catch up mid-run.
  if (event.type === 'benchmark_progress') {
    activeProgress = event;
  } else if (event.type === 'benchmark_completed' || event.type === 'benchmark_failed') {
    activeProgress = null;
  }

  const payload = JSON.stringify(event);
  for (const client of clients) {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    } catch {
      clients.delete(client);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
