import { Board } from '@chalkline/core';
import { SyncProvider } from '@chalkline/core/provider';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

export interface ScriptClient {
  board: Board;
  awareness: Awareness;
  provider: SyncProvider;
  close(): void;
}

/** A headless board client for scripts, using Node's built-in WebSocket. */
export async function connect(server: string, room: string): Promise<ScriptClient> {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const provider = new SyncProvider(doc, {
    url: `${server.replace(/\/$/, '')}/sync/${encodeURIComponent(room)}`,
    awareness,
  });
  provider.connect();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`could not reach ${server}`)), 5000);
    const check = () => {
      if (provider.getStatus().phase === 'online') {
        clearTimeout(timer);
        off();
        resolve();
      }
    };
    const off = provider.subscribe(check);
    check();
  });
  return {
    board: new Board(doc),
    awareness,
    provider,
    close() {
      provider.destroy();
      awareness.destroy();
      doc.destroy();
    },
  };
}

/** Waits until the server has acknowledged everything by answering a fresh handshake. */
export async function settle(client: ScriptClient): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  client.provider.disconnect();
  client.provider.connect();
  await new Promise<void>((resolve) => {
    const off = client.provider.subscribe((status) => {
      if (status.phase === 'online') {
        off();
        resolve();
      }
    });
  });
}
