import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // node:sqlite is a release candidate on Node 26 but still warns as experimental on 23.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
