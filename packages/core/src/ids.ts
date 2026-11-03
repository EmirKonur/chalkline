const SHAPE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Room ids are read aloud and typed, so they skip look-alike characters. */
const ROOM_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

function randomString(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/** A 12-character shape id: about 71 bits, enough that collisions never happen in practice. */
export function newShapeId(): string {
  return randomString(12, SHAPE_ALPHABET);
}

/** A 10-character room id for new boards. */
export function newRoomId(): string {
  return randomString(10, ROOM_ALPHABET);
}

/** Room ids are also accepted from URLs, so the server and client validate them the same way. */
export function isValidRoomId(id: string): boolean {
  return ROOM_ID_PATTERN.test(id);
}
