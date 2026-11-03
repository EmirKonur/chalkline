import pino, { type Logger } from 'pino';

export type { Logger };

/**
 * JSON logs in production. Pretty output only when a developer is watching a
 * terminal, since pino-pretty is a dev dependency and absent from the image.
 */
export function createLogger(level: string): Logger {
  const pretty = process.env.NODE_ENV !== 'production' && process.stdout.isTTY === true;
  return pino({
    level,
    base: { service: 'chalkline-sync' },
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } } }
      : {}),
  });
}
