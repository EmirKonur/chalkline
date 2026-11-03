import { defineConfig, devices } from '@playwright/test';

/** E2E runs against the production build served by the real sync server, like the Docker image. */
const PORT = 4112;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning ../server/src/index.ts',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STATIC_DIR: './dist',
      DATABASE_PATH: ':memory:',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
    },
  },
});
