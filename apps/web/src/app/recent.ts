import { readJson, writeJson } from '../lib/storage.ts';

export interface RecentBoard {
  id: string;
  title: string;
  visitedAt: number;
}

const KEY = 'chalkline:recent';
const LIMIT = 12;

/** Boards opened in this browser, newest first. Purely local; nothing is sent anywhere. */
export function loadRecent(): RecentBoard[] {
  const list = readJson<unknown>(KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is RecentBoard =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentBoard).id === 'string' &&
        typeof (item as RecentBoard).visitedAt === 'number',
    )
    .map((item) => ({ ...item, title: typeof item.title === 'string' ? item.title : '' }))
    .sort((a, b) => b.visitedAt - a.visitedAt);
}

export function rememberBoard(id: string, title: string): void {
  const rest = loadRecent().filter((board) => board.id !== id);
  writeJson(KEY, [{ id, title, visitedAt: Date.now() }, ...rest].slice(0, LIMIT));
}

export function forgetBoard(id: string): void {
  writeJson(
    KEY,
    loadRecent().filter((board) => board.id !== id),
  );
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
