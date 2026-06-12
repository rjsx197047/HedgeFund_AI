/**
 * QA screenshot sweep — NOT part of the regression suite's assertions.
 *
 * Visits every route, exercises the Scorecard's refresh action, and dumps
 * full-window PNGs to /tmp/tal-qa so a human (or agent) can visually
 * inspect each page. Kept in the repo because it doubles as a cheap
 * smoke that every page mounts without a render crash.
 */
import { test, expect } from './fixtures';

const SHOT_DIR = '/tmp/tal-qa';

test('every page renders — screenshot sweep', async ({ window }) => {
  test.setTimeout(120_000);
  await expect(
    window.locator('[data-testid="status-pill-engine"]'),
  ).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });

  const pages: Array<{ hash: string; name: string; settle?: number }> = [
    { hash: '#analyze', name: '01-analyze' },
    { hash: '#watchlist', name: '02-watchlist' },
    { hash: '#history', name: '03-history' },
    { hash: '#scorecard', name: '04-scorecard' },
    { hash: '#settings', name: '05-settings' },
  ];

  for (const p of pages) {
    await window.evaluate((h) => {
      window.location.hash = h;
    }, p.hash);
    await window.waitForTimeout(p.settle ?? 800);
    await window.screenshot({ path: `${SHOT_DIR}/${p.name}.png`, fullPage: true });
  }

  // Scorecard interaction: the refresh button must respond and surface
  // either a notice (scored/pending counts) or a graceful error banner —
  // never an unhandled rejection.
  await window.evaluate(() => {
    window.location.hash = '#scorecard';
  });
  const refresh = window.getByRole('button', { name: /score new outcomes/i });
  await expect(refresh).toBeVisible();
  await refresh.click();
  // Wait for the busy label to clear (up to 60s — first scoring fetches
  // price history per ticker).
  await expect(refresh).toBeEnabled({ timeout: 60_000 });
  await window.waitForTimeout(500);
  await window.screenshot({ path: `${SHOT_DIR}/06-scorecard-after-refresh.png`, fullPage: true });
});
