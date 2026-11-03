# Contributing

## Setup

You need Node 23.6 or newer (CI and the Docker image use Node 26, see `.nvmrc`) and
pnpm 9.15.

```sh
pnpm install
pnpm dev          # web app on http://localhost:4110, sync server on :4111
pnpm seed:demo --room demo-checkout --peers   # optional: a realistic board with two collaborators
```

Vite proxies `/sync` to the server, so the browser always talks to its own origin.

## Scripts

| Command             | What it does                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm lint`         | ESLint (type-aware) and Prettier check                                 |
| `pnpm format`       | Prettier write                                                         |
| `pnpm typecheck`    | `tsc` for every package, including scripts and e2e                     |
| `pnpm test`         | Vitest: unit tests for core and web, server unit and integration tests |
| `pnpm test:e2e`     | Builds the app, starts the real server on :4112, runs Playwright       |
| `pnpm bench:render` | Builds, starts a server on :4113, measures rendering with 2,000 shapes |
| `pnpm build`        | Production build of the web app into `apps/web/dist`                   |
| `pnpm start`        | Runs the server; set `STATIC_DIR=apps/web/dist` to serve the app too   |

The first e2e run needs a browser: `pnpm --filter @chalkline/web exec playwright install chromium`.

## Conventions

- TypeScript is strict with `noUncheckedIndexedAccess` and `erasableSyntaxOnly`
  (the server runs its sources directly, so no enums or parameter properties).
  Relative imports use the `.ts` extension.
- Every document write goes through `Board` in `packages/core`. Reads of shared
  data are defensive; another client may have written anything.
- New interactions should be one undo step per gesture: call `history.cut()` when
  the gesture starts and ends, or use `editor.change()` for discrete actions.
- Comments explain why. Tests should fail if the behavior they describe breaks.
- Keep commits focused, and describe how you tested the change in the PR.
