import { isInk, type Ink } from '@chalkline/core';
import type { Identity } from '../editor/presence.ts';
import { readJson, writeJson } from '../lib/storage.ts';

const KEY = 'chalkline:identity';
export const PRESENCE_COLORS: readonly Ink[] = ['pink', 'butter', 'sky', 'mint', 'lilac', 'peach'];

const ADJECTIVES = [
  'Dusty',
  'Quiet',
  'Bright',
  'Mellow',
  'Swift',
  'Gentle',
  'Sunny',
  'Misty',
  'Bold',
  'Calm',
  'Breezy',
  'Lucky',
];
const ANIMALS = [
  'Heron',
  'Otter',
  'Finch',
  'Badger',
  'Lynx',
  'Wren',
  'Marten',
  'Plover',
  'Ibex',
  'Lark',
  'Newt',
  'Puffin',
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** The name and color this browser uses on every board, created on first visit. */
export function loadIdentity(): Identity {
  const stored = readJson<Partial<Identity> | null>(KEY, null);
  if (stored && typeof stored.name === 'string' && stored.name.trim() && isInk(stored.color)) {
    return { name: stored.name.trim().slice(0, 32), color: stored.color };
  }
  const identity: Identity = {
    name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    color: pick(PRESENCE_COLORS),
  };
  writeJson(KEY, identity);
  return identity;
}

export function saveIdentity(identity: Identity): void {
  writeJson(KEY, identity);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? (parts[0]?.[0] ?? '') + (parts.at(-1)?.[0] ?? '') : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}
