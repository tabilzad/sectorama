import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import websocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { registerRoutes } from './routes/index.js';
import { initVapid } from './services/pushService.js';
import { registerLiveFeed } from './ws/liveFeed.js';
import { initScheduler, initSmartPoller } from './services/scheduler.js';
import { scanDisks, registerDrives } from './services/diskDiscovery.js';
import { refreshAllSmart } from './services/smartService.js';

async function buildApp() {
  const app = Fastify({
    logger: {
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

  // ── Error handler ──────────────────────────────────────────────────────────
  app.setErrorHandler(async (error: Error & { statusCode?: number }, _req, reply) => {
    const statusCode = error.statusCode ?? 500;
    app.log.error(error);
    reply.status(statusCode).send({
      error:  error.message ?? 'Internal Server Error',
      status: statusCode,
    });
  });

  return app;
}

async function main() {
  // ── Initialize SQLite ──────────────────────────────────────────────────────
  console.log(`[sectorama] Initializing SQLite at ${config.sqlite.path}...`);
  initDb();
  console.log('[sectorama] SQLite ready');

  // ── Initialize VAPID keys for Web Push ────────────────────────────────────
  initVapid();

  // ── Build Fastify app ──────────────────────────────────────────────────────
  const app = await buildApp();

  // ── Initial disk scan ──────────────────────────────────────────────────────
  console.log('[sectorama] Scanning for disks...');
  try {
    const discovered = await scanDisks();
    await registerDrives(discovered);
    console.log(`[sectorama] Found ${discovered.length} disk(s)`);
  } catch (err) {
    console.warn('[sectorama] Initial disk scan failed (non-fatal):', err);
  }

  // ── Start server ──────────────────────────────────────────────────────────
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[sectorama] Server running on http://0.0.0.0:${config.port}`);

  // ── Start schedulers ──────────────────────────────────────────────────────
  await initScheduler();
  initSmartPoller();

  // ── Initial SMART cache warm-up (non-blocking, runs in background) ────────
  // The scheduler's first tick at SMART_POLL_INTERVAL_MINUTES will be the first InfluxDB write.
  refreshAllSmart().catch(err =>
    console.warn('[sectorama] SMART cache warm-up failed (non-fatal):', err),
  );
}

main().catch(err => {
  console.error('[sectorama] Fatal error:', err);
  process.exit(1);
});
