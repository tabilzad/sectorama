import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { registerRoutes } from './routes';
import { registerLiveFeed } from './ws/liveFeed.js';

export interface BuildAppOptions {
  /** Pass false to silence request logging (used by tests). */
  logger?: boolean;
}

/** Build the Fastify instance with plugins, routes, and error handling. Does not listen. */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false
      ? false
      : {
          level: config.isProduction ? 'info' : 'debug',
          ...(config.isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: { colorize: true },
                },
              }),
        },
    bodyLimit: 1 * 1024 * 1024, // 1 MB
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin:  config.isProduction ? false : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(websocket);

  // Serve the built React SPA as static files
  if (fs.existsSync(config.paths.public)) {
    await app.register(staticPlugin, {
      root:   config.paths.public,
      prefix: '/',
    });
  }

  // Prevent proxies/browsers from caching the service worker script
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url === '/sw.js') {
      reply.header('Cache-Control', 'no-store');
      reply.header('Service-Worker-Allowed', '/');
    }
    return payload;
  });

  // ── Error handler ──────────────────────────────────────────────────────────
  // Must be set before the route plugins are registered: Fastify binds the
  // error handler to each route at registration time, so a handler installed
  // afterwards would not see their validation errors.
  app.setErrorHandler(async (error: FastifyError, req, reply) => {
    const statusCode = typeof error.statusCode === 'number' && error.statusCode >= 400
      ? error.statusCode
      : 500;

    if (statusCode >= 500) {
      // Log the full error server-side, but never echo internal details
      // (SQL, file paths, upstream responses, tokens) back to the client.
      req.log.error({ err: error }, 'Unhandled request error');
      return reply.status(statusCode).send({ error: 'Internal Server Error', status: statusCode });
    }

    // 4xx errors (validation failures, bad content types, etc.) carry messages
    // that are safe and useful for the caller.
    return reply.status(statusCode).send({ error: error.message, status: statusCode });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await registerRoutes(app);
  registerLiveFeed(app);

  // SPA catch-all — serve index.html for all non-API/WS routes
  app.setNotFoundHandler(async (req, reply) => {
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/ws/')) {
      const indexPath = path.join(config.paths.public, 'index.html');
      if (fs.existsSync(indexPath)) {
        reply.type('text/html');
        return reply.send(fs.createReadStream(indexPath));
      }
    }
    reply.status(404).send({ error: 'Not Found', url: req.url });
  });

  return app;
}
