import {
  CLOSE_FORBIDDEN_ORIGIN,
  CLOSE_INVALID_ROOM,
  SYNC_PATH,
  isValidRoomId,
} from '@chalkline/core';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import sirv from 'sirv';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Config } from './config.ts';
import type { Logger } from './logger.ts';
import { Rooms } from './rooms.ts';
import { DocStore } from './store.ts';

export interface RunningServer {
  port: number;
  rooms: Rooms;
  store: DocStore;
  close(): Promise<void>;
}

const HEARTBEAT_MS = 30_000;

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; " +
    "style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

/** Starts the HTTP server: health check, optional static web app, and the sync WebSocket. */
export async function startServer(config: Config, log: Logger): Promise<RunningServer> {
  const store = new DocStore(config.databasePath);
  const rooms = new Rooms(store, log, {
    compactAfterUpdates: config.compactAfterUpdates,
    flushIntervalMs: config.flushIntervalMs,
    idleUnloadMs: config.idleUnloadMs,
    maxConnections: config.maxConnectionsPerRoom,
  });
  const serveStatic = config.staticDir
    ? sirv(config.staticDir, {
        single: true,
        etag: true,
        setHeaders(res, pathname) {
          // Vite fingerprints everything under /assets, so it never changes.
          res.setHeader(
            'Cache-Control',
            pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      })
    : null;

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({ status: 'ok', rooms: rooms.size, connections: rooms.connectionCount }),
      );
      return;
    }
    if (serveStatic) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
      serveStatic(req, res, () => notFound(res));
      return;
    }
    notFound(res);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxMessageBytes });
  const alive = new WeakSet<WebSocket>();

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(SYNC_PATH)) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    const roomId = safeDecode(url.pathname.slice(SYNC_PATH.length));
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Rejections happen after the upgrade so the browser sees a close code
      // it can act on, instead of a generic failure it would keep retrying.
      if (!originAllowed(config.allowedOrigins, req.headers.origin)) {
        ws.close(CLOSE_FORBIDDEN_ORIGIN, 'origin not allowed');
        return;
      }
      if (!isValidRoomId(roomId)) {
        ws.close(CLOSE_INVALID_ROOM, 'invalid room id');
        return;
      }
      alive.add(ws);
      ws.on('pong', () => alive.add(ws));
      rooms.join(roomId, ws);
    });
  });

  // Ping frames catch sockets whose peer vanished without a close handshake.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(config.port, config.host, () => {
      http.off('error', reject);
      resolve();
    });
  });

  const { port } = http.address() as AddressInfo;
  let closing: Promise<void> | null = null;

  return {
    port,
    rooms,
    store,
    close() {
      closing ??= (async () => {
        clearInterval(heartbeat);
        rooms.closeAll(1001);
        for (const ws of wss.clients) ws.terminate();
        await new Promise<void>((resolve) => wss.close(() => resolve()));
        await new Promise<void>((resolve) => {
          http.close(() => resolve());
          http.closeAllConnections();
        });
        store.close();
      })();
      return closing;
    },
  };
}

function originAllowed(allowed: readonly string[], origin: string | undefined): boolean {
  return allowed.length === 0 || (origin !== undefined && allowed.includes(origin));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}
