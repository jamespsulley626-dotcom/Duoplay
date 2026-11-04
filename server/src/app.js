import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { CATALOG } from '@duoplay/shared';
import { RoomService } from './rooms/RoomService.js';
import { attachSocketHandlers } from './socket.js';
import { MemoryRoomStore } from './store/MemoryRoomStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createGameServer({ store = new MemoryRoomStore(), serviceOptions, sweepEveryMs = 5_000 } = {}) {
  const service = new RoomService(store, serviceOptions);
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: store.size }));
  app.get('/api/games', (_req, res) => res.json(CATALOG));

  // In production, serve the built client and fall back to index.html for /r/CODE links.
  const dist = path.resolve(here, '../../client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : undefined,
    maxHttpBufferSize: 16_000, // moves and chat are tiny; reject anything large
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  attachSocketHandlers(io, service);
  const sweeper = setInterval(() => service.sweep(), sweepEveryMs);
  sweeper.unref();

  return {
    app,
    httpServer,
    io,
    service,
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper);
        for (const room of [...store.values()]) service.delete(room);
        io.close(() => resolve());
      }),
  };
}
