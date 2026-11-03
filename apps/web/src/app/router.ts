import { isValidRoomId } from '@chalkline/core';
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'board'; id: string } | { name: 'not-found' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  const match = /^\/b\/([^/]+)\/?$/.exec(pathname);
  const id = match ? safeDecode(match[1] as string) : null;
  return id !== null && isValidRoomId(id) ? { name: 'board', id } : { name: 'not-found' };
}

/** Pulls a room id out of a pasted board URL, or accepts a bare id. */
export function roomFromInput(input: string): string | null {
  const value = input.trim();
  const fromPath = /\/b\/([^/?#\s]+)/.exec(value)?.[1];
  const candidate = fromPath ? safeDecode(fromPath) : value;
  return candidate !== null && isValidRoomId(candidate) ? candidate : null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function boardPath(id: string): string {
  return `/b/${encodeURIComponent(id)}`;
}

const CHANGE = 'chalkline:navigate';

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener(CHANGE, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(CHANGE, listener);
  };
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}
