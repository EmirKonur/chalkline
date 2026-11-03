import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { startServer } from './server.ts';

const config = loadConfig();
const log = createLogger(config.logLevel);

try {
  const server = await startServer(config, log);
  log.info(
    {
      port: server.port,
      database: config.databasePath,
      staticDir: config.staticDir ?? undefined,
    },
    'chalkline sync server listening',
  );

  const shutdown = (signal: string) => {
    log.info({ signal }, 'shutting down');
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
} catch (error) {
  log.fatal({ err: error }, 'failed to start');
  process.exit(1);
}
