import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startEngine, stopEngine, type EngineHandshake } from './engine-runner';
import { registerAppMenu } from './menu';
import {
  deleteSecret,
  getSecret,
  isEncryptionAvailable,
  listSecrets,
  secretsFileLocation,
  setSecret,
} from './secrets';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

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
    title: 'TradingAgentsLab',
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

ipcMain.handle('secrets:get', (_evt, key: string) => getSecret(key));

ipcMain.handle('secrets:list', () => listSecrets());

ipcMain.handle('secrets:delete', (_evt, key: string) => deleteSecret(key));

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
