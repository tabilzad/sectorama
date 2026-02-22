import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { LiveFeedEvent } from '@sectorama/shared';

/** All currently-connected live-feed WebSocket clients */
const clients = new Set<WebSocket>();

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
  });
}

/** Broadcast an event to all connected clients */
export function broadcast(event: LiveFeedEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    try {
      if (client.readyState === 1 /* OPEN */) {
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
