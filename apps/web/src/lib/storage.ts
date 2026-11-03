/**
 * localStorage that never throws. Private windows, disabled storage, and
 * quota errors all degrade to "nothing remembered" instead of a broken page.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here; losing it is acceptable.
  }
}
