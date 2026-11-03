import { SyncProvider } from '@chalkline/core/provider';
import pino from 'pino';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { loadConfig, type Config } from '../src/config.ts';
import { startServer, type RunningServer } from '../src/server.ts';

export const silentLog = pino({ level: 'silent' });

export async function bootServer(overrides: Partial<Config> = {}): Promise<RunningServer> {
  const config: Config = {
    ...loadConfig({ PORT: '0', HOST: '127.0.0.1', DATABASE_PATH: ':memory:' }),
    flushIntervalMs: 10,
    idleUnloadMs: 50,
    ...overrides,
  };
  return startServer(config, silentLog);
}

export interface Client {
  doc: Y.Doc;
  awareness: Awareness;
  provider: SyncProvider;
}

export function connectClient(server: RunningServer, room: string): Client {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const provider = new SyncProvider(doc, {
    url: `ws://127.0.0.1:${server.port}/sync/${room}`,
    awareness,
    backoffBaseMs: 20,
    backoffMaxMs: 100,
  });
  provider.connect();
  return { doc, awareness, provider };
}

export function closeClient(client: Client): void {
  client.provider.destroy();
  client.awareness.destroy();
  client.doc.destroy();
}

export async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const online = (client: Client) => () => client.provider.getStatus().phase === 'online';
