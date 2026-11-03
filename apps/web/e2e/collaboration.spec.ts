import { expect, test } from '@playwright/test';
import {
  drawStroke,
  openBoard,
  paintedPixels,
  shapeCount,
  uniqueRoom,
  visitor,
} from './helpers.ts';

test('a stroke drawn in one browser appears in the other, and cursors show up live', async ({
  browser,
}) => {
  const room = uniqueRoom('live');
  const alice = await openBoard(await visitor(browser, 'Alice Heron', 'pink'), room);
  const bob = await openBoard(await visitor(browser, 'Bob Otter', 'sky'), room);

  await shapeCount(bob, 0);
  const before = await paintedPixels(bob);
  await drawStroke(alice, 420, 360);

  await shapeCount(bob, 1);
  await expect.poll(() => paintedPixels(bob)).toBeGreaterThan(before + 200);

  await bob.mouse.move(700, 420);
  await bob.mouse.move(720, 430, { steps: 4 });
  const cursor = alice.getByTestId('remote-cursor').filter({ hasText: 'Bob Otter' });
  await expect(cursor).toBeVisible();
  await expect(alice.getByTestId('peer-avatar')).toHaveAttribute('aria-label', /Bob Otter/);
});

test('undo only removes your own work', async ({ browser }) => {
  const room = uniqueRoom('undo');
  const alice = await openBoard(await visitor(browser, 'Alice Heron', 'pink'), room);
  const bob = await openBoard(await visitor(browser, 'Bob Otter', 'sky'), room);

  await drawStroke(alice, 300, 300);
  await shapeCount(bob, 1);
  await drawStroke(bob, 300, 500);
  await shapeCount(alice, 2);

  await alice.getByRole('button', { name: 'Undo' }).click();
  await shapeCount(alice, 1);
  await shapeCount(bob, 1);
  // Alice has nothing left to undo: Bob's stroke is not hers.
  await expect(alice.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('edits made offline are counted and sync after reconnecting', async ({ browser }) => {
  const room = uniqueRoom('offline');
  const aliceContext = await visitor(browser, 'Alice Heron', 'pink');
  const alice = await openBoard(aliceContext, room);
  const bob = await openBoard(await visitor(browser, 'Bob Otter', 'sky'), room);

  await aliceContext.setOffline(true);
  const status = alice.getByTestId('connection-status');
  await expect(status).toHaveAttribute('data-phase', 'offline');

  await drawStroke(alice, 300, 300);
  await alice.keyboard.press('r');
  await alice.mouse.move(600, 250);
  await alice.mouse.down();
  await alice.mouse.move(760, 360, { steps: 6 });
  await alice.mouse.up();
  await expect(status).toHaveText('Offline · 2 changes waiting');
  await shapeCount(bob, 0);

  await aliceContext.setOffline(false);
  await expect(status).toHaveAttribute('data-phase', 'online');
  await shapeCount(bob, 2);
  await expect(status).not.toContainText('waiting');
});

test('the landing page creates a board and the cheatsheet opens with ?', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-board').click();
  await expect(page).toHaveURL(/\/b\/[a-z0-9]{10}$/);
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await page.getByTestId('board-canvas').focus();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
});

test('an unknown address shows the not-found page', async ({ page }) => {
  await page.goto('/nope/at/all');
  await expect(page.getByRole('heading', { name: 'Nothing written here.' })).toBeVisible();
});

test('someone joining a board with content sees all of it, zoomed to fit', async ({ browser }) => {
  const room = uniqueRoom('fit');
  const alice = await openBoard(await visitor(browser, 'Alice Heron', 'pink'), room);
  await alice.getByTestId('board-canvas').focus();
  await alice.keyboard.press('-');
  await alice.keyboard.press('-');
  await expect(alice.locator('.zoom-readout')).toHaveText('50%');
  await alice.keyboard.press('r');
  await alice.mouse.move(100, 120);
  await alice.mouse.down();
  await alice.mouse.move(1180, 700, { steps: 8 });
  await alice.mouse.up();

  const bob = await openBoard(await visitor(browser, 'Bob Otter', 'sky'), room);
  await shapeCount(bob, 1);
  await expect(bob.locator('.zoom-readout')).not.toHaveText('100%');
});
