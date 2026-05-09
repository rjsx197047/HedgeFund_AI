import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startEngine, stopEngine, type EngineHandshake } from './engine-runner';
import { registerAppMenu } from './menu';
import { OpenAIOAuthService } from './oauth-openai';
import {
  deleteSecret,
  getSecret,
  isEncryptionAvailable,
  listSecrets,
  secretsFileLocation,
  setSecret,
} from './secrets';
import { checkUpstream, type UpstreamCheckResult } from './upstream-check';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

// Display name for the macOS menu bar, dock tooltip, and the first menu
// item next to the Apple logo. Must be called before `app.whenReady()`
// resolves and before the menu template references `app.name`.
// Repo / package names stay one word ("TradingAgentsLab") — only the
// user-facing display surface is three words.
app.setName('Trading Agents Lab');

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    title: 'Trading Agents Lab',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

ipcMain.handle('engine:get-handshake', async (): Promise<EngineHandshake> => {
  return startEngine();
});

ipcMain.handle('secrets:availability', () => ({
  available: isEncryptionAvailable(),
  filePath: secretsFileLocation(),
}));

ipcMain.handle(
  'secrets:set',
  (_evt, key: string, value: string) => setSecret(key, value),
);

ipcMain.handle('secrets:get', (_evt, key: string) => {
  // OAuth tokens have a dedicated bridge (`oauth:openai:credentials`) that
  // refreshes-on-stale and never returns the raw blob to the renderer.
  // Block the `oauth:` prefix here so the renderer cannot accidentally
  // (or maliciously) read the token JSON via the generic secrets channel.
  if (typeof key === 'string' && key.startsWith('oauth:')) return null;
  return getSecret(key);
});

ipcMain.handle('secrets:list', () => listSecrets());

ipcMain.handle('secrets:delete', (_evt, key: string) => deleteSecret(key));

// ---- OAuth (OpenAI Codex / ChatGPT subscription) -------------------------
//
// Renderer never sees the access/refresh tokens — they're decrypted in main
// and attached as a Bearer header by `engine-client.ts` only at WS-frame
// build time. The renderer only sees status (connected/email/expires).

let openaiOAuth: OpenAIOAuthService | null = null;

function ensureOAuthService(): OpenAIOAuthService {
  if (!openaiOAuth) {
    openaiOAuth = new OpenAIOAuthService(
      (event) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth:openai:progress', event);
        }
      },
      (event) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth:openai:prompt', event);
        }
      },
    );
  }
  return openaiOAuth;
}

ipcMain.handle('oauth:openai:start', () => ensureOAuthService().startLogin());
ipcMain.handle('oauth:openai:status', () => ensureOAuthService().getStatus());
ipcMain.handle('oauth:openai:disconnect', () =>
  ensureOAuthService().disconnect(),
);
ipcMain.on('oauth:openai:prompt-response', (_evt, value: string) => {
  ensureOAuthService().handlePromptResponse(value);
});
// Used by `engine-client.ts` to fetch fresh credentials right before
// building the WS start frame. Returns the credentials object (or null).
ipcMain.handle('app:check-upstream', async (): Promise<UpstreamCheckResult> => {
  return checkUpstream();
});

// ---- Graceful shutdown / restart ---------------------------------------
//
// Founder ask 2026-05-09: surface a way to cleanly stop + relaunch the app
// without going to the terminal. The macOS red traffic-light just hides
// the window; closing all windows fires `window-all-closed` which calls
// stopEngine() — but only on non-darwin platforms does it `app.quit()`.
// Result: on macOS the app sits in the dock with no window AND the engine
// is killed, leaving the user in a weird state.
//
// These IPC handlers make Shutdown + Restart explicit. Both:
//   1. SIGTERM the tracked engine via stopEngine()
//   2. (dev only) sweep any orphan engines from previous crashed sessions
//   3. Either app.quit() or app.relaunch() + app.quit()
//
// The dev-only pkill sweep uses execFile (no shell — no command injection
// surface) and exits 0 even when nothing matched. In production builds
// the engine is a bundled binary at a different path, so this match
// pattern won't trigger anything outside dev.

const IS_DEV = Boolean(process.env['VITE_DEV_SERVER_URL']);

async function sweepOrphanEngines(): Promise<void> {
  if (!IS_DEV) return;
  if (process.platform === 'win32') return; // pkill not available
  await new Promise<void>((resolve) => {
    execFile(
      'pkill',
      ['-f', 'engine/.venv/bin/python -m engine'],
      { timeout: 3000 },
      () => resolve(), // ignore errors — pkill exits 1 when no match
    );
  });
}

async function confirmAction(action: 'shutdown' | 'restart'): Promise<boolean> {
  const w = win;
  const messages = {
    shutdown: {
      title: 'Shut down Trading Agents Lab?',
      detail: 'The engine sidecar will stop and the app will quit. Any in-flight debate is aborted.',
      confirmLabel: 'Shut down',
    },
    restart: {
      title: 'Restart Trading Agents Lab?',
      detail: 'The engine sidecar will stop and the app will relaunch. Any in-flight debate is aborted.',
      confirmLabel: 'Restart',
    },
  };
  const cfg = messages[action];
  const result = await dialog.showMessageBox(w ?? undefined!, {
    type: 'question',
    buttons: ['Cancel', cfg.confirmLabel],
    defaultId: 0,
    cancelId: 0,
    title: cfg.title,
    message: cfg.title,
    detail: cfg.detail,
  });
  return result.response === 1;
}

ipcMain.handle('app:shutdown', async (): Promise<void> => {
  const ok = await confirmAction('shutdown');
  if (!ok) return;
  stopEngine();
  await sweepOrphanEngines();
  app.quit();
});

ipcMain.handle('app:restart', async (): Promise<void> => {
  const ok = await confirmAction('restart');
  if (!ok) return;
  stopEngine();
  await sweepOrphanEngines();
  if (IS_DEV) {
    // Dev mode quirk: app.relaunch() respawns Electron but the npm
    // script that owns Vite dies with the old Electron, leaving the new
    // Electron loading from a dead localhost:5173. Delegate to a
    // detached helper script that waits for our quit, kills any
    // leftovers, then spawns a fresh `npm run dev`. See tools/dev-restart.sh
    // for the full dance. Production builds use the simple relaunch.
    const repoRoot = path.resolve(app.getAppPath(), '..');
    const restartScript = path.join(repoRoot, 'tools', 'dev-restart.sh');
    const devProcess = spawn(restartScript, [], {
      cwd: repoRoot,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    devProcess.unref();
  } else {
    app.relaunch();
  }
  app.quit();
});

ipcMain.handle('oauth:openai:credentials', async () => {
  return ensureOAuthService().refreshIfNeeded();
});

app.whenReady().then(() => {
  // Start the sidecar eagerly so the handshake is ready by the time the
  // renderer asks for it. The IPC handler awaits the same promise.
  startEngine().catch((err) => {
    console.error('[engine] failed to start:', err);
  });

  registerAppMenu(() => win);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopEngine();
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('before-quit', () => {
  stopEngine();
});
