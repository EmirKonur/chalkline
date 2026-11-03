import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export function uniqueRoom(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A browser context that already has a name and cursor color, like a returning visitor. */
export async function visitor(
  browser: Browser,
  name: string,
  color: string,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([n, c]) => localStorage.setItem('chalkline:identity', JSON.stringify({ name: n, color: c })),
    [name, color],
  );
  return context;
}

export async function openBoard(context: BrowserContext, room: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/b/${room}`);
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-phase', 'online');
  return page;
}

export function shapeCount(page: Page, count: number) {
  return expect(page.getByTestId('board-canvas')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Board with ${count} shapes?\\.`),
  );
}

/** Draws a wavy pen stroke starting at (x, y) in page coordinates. */
export async function drawStroke(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(x + i * 9, y + Math.sin(i / 3) * 30);
  }
  await page.mouse.up();
}

/** Number of painted pixels on the board canvas (the board color itself is CSS, not canvas). */
export function paintedPixels(page: Page): Promise<number> {
  return page.getByTestId('board-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    // Grid dots are faint; count only pixels that are clearly ink.
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 160) painted++;
    return painted;
  });
}
