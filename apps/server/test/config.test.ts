import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses development defaults', () => {
    const config = loadConfig({}, '/srv/app');
    expect(config).toMatchObject({
      port: 4111,
      databasePath: '/srv/app/data/chalkline.db',
      staticDir: null,
      allowedOrigins: [],
    });
  });

  it('parses lists and resolves paths against the working directory', () => {
    const config = loadConfig(
      { STATIC_DIR: 'web/dist', ALLOWED_ORIGINS: 'https://a.test, https://b.test,' },
      '/srv/app',
    );
    expect(config.staticDir).toBe('/srv/app/web/dist');
    expect(config.allowedOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('fails fast on a bad number instead of silently using a default', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => loadConfig({ COMPACT_AFTER_UPDATES: '1' })).toThrow(/COMPACT_AFTER_UPDATES/);
  });
});
