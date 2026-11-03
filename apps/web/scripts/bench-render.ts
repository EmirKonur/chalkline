/**
 * Render benchmark: 2,000 shapes, measured in a real browser.
 *
 *   pnpm bench:render               (builds first, then runs headless)
 *   pnpm --filter @chalkline/web bench:render --shapes 5000 --dpr 1 --headed
 *
 * Starts its own sync server on port 4113 serving the production build,
 * seeds a board over a real WebSocket, opens it in Chromium with `?perf`
 * (which makes the renderer record a User Timing measure per frame), then
 * drives continuous pan and zoom with wheel events dispatched every frame.
 */
import type { Ink, ShapeInit, Size } from '@chalkline/core';
import { INKS, SIZES } from '@chalkline/core';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { connect, settle } from './client.ts';

const { values } = parseArgs({
  options: {
    shapes: { type: 'string', default: '2000' },
    dpr: { type: 'string', default: '2' },
    seconds: { type: 'string', default: '4' },
    headed: { type: 'boolean', default: false },
    theme: { type: 'string', default: 'chalkboard' },
  },
});
const SHAPES = Number(values.shapes);
const DPR = Number(values.dpr);
const DURATION_MS = Number(values.seconds) * 1000;
const PORT = 4113;
const WEB_DIR = path.resolve(import.meta.dirname, '..');

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A board-shaped mix: mostly pen strokes (the expensive kind), plus boxes, arrows, text, notes. */
function benchShapes(count: number): ShapeInit[] {
  const rnd = seeded(2024);
  const pick = <T>(items: readonly T[]) => items[Math.floor(rnd() * items.length)] as T;
  const out: ShapeInit[] = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * 6000;
    const y = rnd() * 3600;
    const ink: Ink = pick(INKS);
    const size: Size = pick(SIZES.slice(0, 3));
    const roll = rnd();
    if (roll < 0.6) {
      const points: number[] = [];
      let px = 0;
      let py = 0;
      let angle = rnd() * Math.PI * 2;
      const length = 40 + Math.floor(rnd() * 80);
      for (let p = 0; p < length; p++) {
        angle += (rnd() - 0.5) * 0.5;
        px += Math.cos(angle) * 4;
        py += Math.sin(angle) * 4;
        points.push(px, py, 0.5);
      }
      out.push({ kind: 'pen', x, y, points, realPressure: false, sx: 1, sy: 1, ink, size });
    } else if (roll < 0.75) {
      out.push({
        kind: 'rect',
        x,
        y,
        w: 60 + rnd() * 200,
        h: 40 + rnd() * 120,
        fill: pick(['none', 'tint'] as const),
        ink,
        size,
      });
    } else if (roll < 0.85) {
      out.push({
        kind: 'ellipse',
        x,
        y,
        w: 60 + rnd() * 180,
        h: 40 + rnd() * 120,
        fill: 'none',
        ink,
        size,
      });
    } else if (roll < 0.93) {
      out.push({
        kind: 'arrow',
        x,
        y,
        dx: (rnd() - 0.5) * 300,
        dy: (rnd() - 0.5) * 200,
        ink,
        size,
      });
    } else if (roll < 0.98) {
      out.push({
        kind: 'text',
        x,
        y,
        text: pick(['cache miss', 'retry with backoff', 'p99 300 ms', 'owner?', 'ship it']),
        scale: 1,
        ink,
        size,
      });
    } else {
      out.push({
        kind: 'sticky',
        x,
        y,
        w: 200,
        h: 180,
        text: 'Follow up after the review',
        ink: pick(['butter', 'pink', 'sky'] as const),
        size: 'm',
      });
    }
  }
  return out;
}

async function waitForHealth(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not come up at ${url}`);
}

interface ScenarioResult {
  scenario: string;
  frames: number;
  fps: number;
  frameP95Ms: number;
  renderMeanMs: number;
  renderP95Ms: number;
  renderMaxMs: number;
  drawnMean: number;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

const server = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '../server/src/index.ts'],
  {
    cwd: WEB_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STATIC_DIR: './dist',
      DATABASE_PATH: ':memory:',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  },
);

try {
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);
  const room = `bench-${Date.now().toString(36)}`;
  const seeder = await connect(`ws://127.0.0.1:${PORT}`, room);
  seeder.board.createMany(benchShapes(SHAPES));
  await settle(seeder);
  seeder.close();

  const browser = await chromium.launch({ headless: !values.headed });
  const browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: DPR,
  });
  await context.addInitScript(
    (theme) => localStorage.setItem('chalkline:theme', JSON.stringify(theme)),
    values.theme,
  );
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/b/${room}?perf`);
  await page
    .getByTestId('board-canvas')
    .and(page.locator(`[aria-label^="Board with ${SHAPES} shapes"]`))
    .waitFor({ timeout: 30_000 });
  await page.getByTestId('board-canvas').focus();

  const scenarios: { name: string; setup: string; mode: 'pan' | 'zoom' }[] = [
    { name: `pan, zoomed to fit (all ${SHAPES} in view)`, setup: 'Shift+1', mode: 'pan' },
    { name: 'pan at 100% (culling active)', setup: 'Shift+0', mode: 'pan' },
    { name: 'pinch-zoom sweep', setup: 'Shift+1', mode: 'zoom' },
  ];
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    await page.keyboard.press(scenario.setup);
    await page.waitForTimeout(600);
    const zoomLabel = await page.locator('.zoom-readout').innerText();
    const raw = await page.evaluate(
      async ({ mode, duration }) => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="board-canvas"]');
        if (!canvas) throw new Error('no canvas');
        const rect = canvas.getBoundingClientRect();
        performance.clearMeasures('chalkline:render');
        const frames: number[] = [];
        await new Promise<void>((resolve) => {
          // Motion is a function of time, not frame count, so a faster display
          // sees the same shapes in view as a slower one: the camera pans
          // around a 300 px loop, or zooms between 0.45x and 2.2x of the start.
          const start = performance.now();
          let last = start;
          const panX = (t: number) => Math.sin(t / 700) * 300;
          const panY = (t: number) => Math.sin(t / 900) * 200;
          const logZoom = (t: number) => Math.sin(t / 600) * 0.8;
          const tick = (now: number) => {
            frames.push(now);
            const t = now - start;
            const prev = last - start;
            last = now;
            canvas.dispatchEvent(
              new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
                ctrlKey: mode === 'zoom',
                // The editor pans by -delta and zooms by exp(-deltaY / 100) for ctrl+wheel.
                deltaX: mode === 'pan' ? panX(prev) - panX(t) : 0,
                deltaY: mode === 'pan' ? panY(prev) - panY(t) : (logZoom(prev) - logZoom(t)) * 100,
              }),
            );
            if (t < duration) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        const renders = performance.getEntriesByName('chalkline:render').map((e) => ({
          ms: e.duration,
          drawn: ((e as PerformanceMeasure).detail as { drawn: number }).drawn,
        }));
        return { frames, renders };
      },
      { mode: scenario.mode, duration: DURATION_MS },
    );
    const intervals = raw.frames
      .slice(1)
      .map((t, i) => t - (raw.frames[i] as number))
      .sort((a, b) => a - b);
    const renderMs = raw.renders.map((r) => r.ms).sort((a, b) => a - b);
    const span = (raw.frames.at(-1) ?? 0) - (raw.frames[0] ?? 0);
    results.push({
      scenario: `${scenario.name}, from ${zoomLabel}`,
      frames: raw.frames.length,
      fps: Math.round(((raw.frames.length - 1) / span) * 1000 * 10) / 10,
      frameP95Ms: Math.round(percentile(intervals, 0.95) * 10) / 10,
      renderMeanMs:
        Math.round((renderMs.reduce((a, b) => a + b, 0) / Math.max(1, renderMs.length)) * 100) /
        100,
      renderP95Ms: Math.round(percentile(renderMs, 0.95) * 100) / 100,
      renderMaxMs: Math.round((renderMs.at(-1) ?? 0) * 100) / 100,
      drawnMean: Math.round(
        raw.renders.reduce((a, r) => a + r.drawn, 0) / Math.max(1, raw.renders.length),
      ),
    });
  }
  await browser.close();

  const machine = `${os.cpus()[0]?.model ?? 'unknown CPU'}, ${os.platform()} ${os.release()}, Node ${process.version}`;
  const browserInfo = `Chromium ${browserVersion} via Playwright, ${values.headed ? 'headed' : 'headless'}, 1440x900 at ${DPR}x, ${values.theme} theme`;
  const lines = [
    `Shapes: ${SHAPES}. ${browserInfo}. ${machine}.`,
    '',
    '| Scenario | FPS | p95 frame (ms) | Render mean (ms) | Render p95 (ms) | Render max (ms) | Shapes drawn per frame |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.scenario} | ${r.fps} | ${r.frameP95Ms} | ${r.renderMeanMs} | ${r.renderP95Ms} | ${r.renderMaxMs} | ${r.drawnMean} |`,
    ),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  const outDir = path.join(WEB_DIR, 'bench-results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'render.json'),
    JSON.stringify({ shapes: SHAPES, browser: browserInfo, machine, results }, null, 2),
  );
} finally {
  server.kill('SIGTERM');
}
