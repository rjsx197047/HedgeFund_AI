/**
 * Test fixture for launching Electron + the engine sidecar against a
 * sandboxed userData directory + a sandboxed sessions DB.
 *
 * Isolation: every test gets a fresh tmp directory for both, so:
 * - Secrets the test writes never leak into the founder's real keyring file
 * - Persisted sessions never pollute the founder's real history
 * - Cost-guard state starts fresh per test
 *
 * Engine spawning happens via the normal main.ts startEngine() path —
 * we don't mock it. Tests exercise the actual contract from UI through
 * IPC through HTTP/WS to the Python sidecar.
 *
 * Orphan engine sweep on test teardown: if a test crashes between
 * `_electron.launch()` and `app.close()`, the engine survives. The
 * afterEach hook below issues a SIGTERM via pkill to clean up. Mirrors
 * the same sweep electron/main.ts does for the dev path.
 */
import { test as base, _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..');
// Engine entry — must match what electron/main.ts → engine-runner.ts spawns.
const ENGINE_VENV_PY = path.join(REPO_ROOT, 'engine', '.venv', 'bin', 'python');

interface TalFixtures {
  /** Launched Electron app. Closes on test teardown. */
  app: ElectronApplication;
  /** The first BrowserWindow's Page object. */
  window: Page;
  /** The sandbox dir for this test. Already passed to the app. Useful
   * for asserting against disk state (secrets.json, sessions.db). */
  sandboxDir: string;
}

async function sweepOrphanEngines(): Promise<void> {
  try {
    await execFileAsync('pkill', ['-f', ENGINE_VENV_PY + ' -m engine'], {
      timeout: 3000,
    });
  } catch {
    // pkill exits 1 when no process matched — that's the normal case.
  }
}

export const test = base.extend<TalFixtures>({
  sandboxDir: async ({}, use) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tal-e2e-'));
    await use(dir);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  },

  app: async ({ sandboxDir }, use) => {
    const userDataDir = path.join(sandboxDir, 'userData');
    const sessionsDb = path.join(sandboxDir, 'sessions.db');

    const app = await electron.launch({
      args: [
        DESKTOP_ROOT,
        // Sandbox the secrets file and any other safeStorage-backed data.
        `--user-data-dir=${userDataDir}`,
      ],
      cwd: DESKTOP_ROOT,
      env: {
        ...process.env,
        // Sandbox the SQLite session store the engine writes to.
        TAL_SESSIONS_DB: sessionsDb,
        // No Vite dev server — main.ts falls through to loading
        // dist/index.html. We rely on the caller having built first.
        VITE_DEV_SERVER_URL: '',
        // Disable the postinstall Info.plist patch's noisy stdout
        // during repeated test launches.
        TAL_QUIET: '1',
      },
    });

    await use(app);

    try {
      await app.close();
    } catch {
      // App may already be down; fall through to the orphan sweep.
    }
    await sweepOrphanEngines();
  },

  window: async ({ app }, use) => {
    const win = await app.firstWindow();
    // Surface renderer console errors to the test output so a failing
    // assertion isn't the first hint that the renderer threw.
    win.on('pageerror', (err) => {
      console.error('[renderer pageerror]', err.message);
    });
    win.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[renderer error]', msg.text());
      }
    });
    await use(win);
  },
});

export { expect };
