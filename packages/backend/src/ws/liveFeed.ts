import type { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import type { LiveFeedEvent } from '@sectorama/shared';

/** All currently-connected live-feed WebSocket clients */
const clients = new Set<WebSocket>();

/**
 * Last benchmark_progress event broadcast, if a benchmark is currently running.
 * Sent to newly-connecting clients so they can restore the progress bar on refresh.
 * Cleared when benchmark_completed or benchmark_failed is broadcast.
 */
let activeProgress: LiveFeedEvent | null = null;

/** Register the WebSocket route — call once during server setup */
export function registerLiveFeed(app: FastifyInstance): void {
  app.get('/ws/live-feed', { websocket: true }, (socket) => {
    clients.add(socket);

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });

    // Send a welcome ping so the client knows it's connected
    socket.send(JSON.stringify({ type: 'connected', clientCount: clients.size }));

    // If a benchmark is in progress, replay the last known progress event so the
    // client can restore the progress bar without waiting for the next tick.
    if (activeProgress) {
      socket.send(JSON.stringify(activeProgress));
    }
  });
}

/** Broadcast an event to all connected clients */
export function broadcast(event: LiveFeedEvent): void {
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
