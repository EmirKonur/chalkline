import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  /** SQLite file, or `:memory:` for tests. */
  databasePath: string;
  /** Directory with the built web app; when null only the sync endpoint is served. */
  staticDir: string | null;
  /** Allowed Origin headers for WebSocket upgrades; empty allows any origin. */
  allowedOrigins: readonly string[];
  /** Rows in a room's update log that trigger compaction into a single snapshot. */
  compactAfterUpdates: number;
  /** How long buffered updates wait before being written as one merged row. */
  flushIntervalMs: number;
  /** How long an empty room stays in memory before it is compacted and unloaded. */
  idleUnloadMs: number;
  maxConnectionsPerRoom: number;
  /** Largest single WebSocket message accepted, in bytes. */
  maxMessageBytes: number;
  logLevel: string;
}

type Env = Record<string, string | undefined>;

/** Reads configuration from the environment and fails fast on invalid values. */
export function loadConfig(env: Env = process.env, cwd = process.cwd()): Config {
  const databasePath = env.DATABASE_PATH?.trim() || './data/chalkline.db';
  const staticDir = env.STATIC_DIR?.trim();
  return {
    port: int(env, 'PORT', 4111, 0, 65_535),
    host: env.HOST?.trim() || '0.0.0.0',
    databasePath: databasePath === ':memory:' ? databasePath : path.resolve(cwd, databasePath),
    staticDir: staticDir ? path.resolve(cwd, staticDir) : null,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    compactAfterUpdates: int(env, 'COMPACT_AFTER_UPDATES', 200, 2, 1_000_000),
    flushIntervalMs: int(env, 'FLUSH_INTERVAL_MS', 500, 0, 60_000),
    idleUnloadMs: int(env, 'IDLE_UNLOAD_MS', 30_000, 0, 3_600_000),
    maxConnectionsPerRoom: int(env, 'MAX_CONNECTIONS_PER_ROOM', 64, 1, 10_000),
    maxMessageBytes: int(env, 'MAX_MESSAGE_BYTES', 8 * 1024 * 1024, 1024, 256 * 1024 * 1024),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
  };
}

function int(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}
