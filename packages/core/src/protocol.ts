import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

/**
 * Wire format. Message ids match y-websocket, so a stock y-websocket client
 * can talk to the Chalkline server and the other way around.
 */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

/** WebSocket path prefix; the room id follows it. */
export const SYNC_PATH = '/sync/';

/** Close codes the server uses to tell a client not to retry. */
export const CLOSE_INVALID_ROOM = 4400;
export const CLOSE_FORBIDDEN_ORIGIN = 4403;
export const CLOSE_ROOM_FULL = 4429;

export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

export function encodeUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

export function encodeAwareness(
  awareness: awarenessProtocol.Awareness,
  clients: readonly number[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, [...clients]),
  );
  return encoding.toUint8Array(encoder);
}
