import { parseShape, type Shape } from '@chalkline/core';

export const CLIPBOARD_MIME = 'application/x-chalkline+json';
const MAX_PASTED_TEXT = 5000;

interface Payload {
  app: 'chalkline';
  version: 1;
  shapes: Shape[];
}

export function serializeShapes(shapes: readonly Shape[]): string {
  const payload: Payload = { app: 'chalkline', version: 1, shapes: [...shapes] };
  return JSON.stringify(payload);
}

export type Pasted = { kind: 'shapes'; shapes: Shape[] } | { kind: 'text'; text: string } | null;

/**
 * Accepts our own payload (from the custom MIME type, or from text/plain on
 * browsers that drop custom types) or falls back to plain text, which becomes
 * a text shape. Every pasted shape is validated like any remote edit.
 */
export function parseClipboard(custom: string, plain: string): Pasted {
  for (const raw of [custom, plain]) {
    const shapes = parsePayload(raw);
    if (shapes) return { kind: 'shapes', shapes };
  }
  const text = plain.replace(/\r\n?/g, '\n').trim();
  return text ? { kind: 'text', text: text.slice(0, MAX_PASTED_TEXT) } : null;
}

function parsePayload(raw: string): Shape[] | null {
  if (!raw.startsWith('{')) return null;
  try {
    const data = JSON.parse(raw) as Partial<Payload>;
    if (data.app !== 'chalkline' || !Array.isArray(data.shapes)) return null;
    const shapes = data.shapes.map(parseShape).filter((s): s is Shape => s !== null);
    return shapes.length > 0 ? shapes : null;
  } catch {
    return null;
  }
}
