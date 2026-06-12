/**
 * QA: Scorecard page rendered against a pre-seeded database.
 *
 * Skipped unless TAL_QA_SEED_DB points at a sessions.db that already
 * contains scored outcomes (see the seeding snippet in the session
 * worklog). Copies the seed over the sandbox DB before the renderer's
 * first /scorecard read, then verifies the populated layout and
 * screenshots it for visual inspection.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { test, expect } from './fixtures';

const SEED = process.env.TAL_QA_SEED_DB ?? '';

test('scorecard renders seeded outcomes', async ({ window, sandboxDir }) => {
  test.skip(!SEED || !existsSync(SEED), 'TAL_QA_SEED_DB not provided');
  copyFileSync(SEED, `${sandboxDir}/sessions.db`);

  await expect(
    window.locator('[data-testid="status-pill-engine"]'),
  ).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });

  await window.evaluate(() => {
    window.location.hash = '#scorecard';
  });

  // Populated layout: both horizon sections, stat bars, calibration
  // tables, and the recent-outcomes list.
  await expect(window.getByText('5 trading days')).toBeVisible({ timeout: 15_000 });
  await expect(window.getByText('20 trading days')).toBeVisible();
  await expect(window.getByText('Confidence calibration').first()).toBeVisible();
  await expect(window.getByText('Recent outcomes')).toBeVisible();
  await expect(window.getByText('aligned').first()).toBeVisible();

  await window.waitForTimeout(400);
  await window.screenshot({ path: '/tmp/tal-qa/07-scorecard-with-data.png', fullPage: true });
});
