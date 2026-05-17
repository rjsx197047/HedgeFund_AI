/**
 * Minimal window-bounds persistence.
 *
 * Writes the BrowserWindow's last bounds to `<userData>/window-state.json`
 * on close, restores them on next launch. Falls back to the hard-coded
 * defaults in main.ts when no state file exists or the JSON is malformed.
 *
 * Why a tiny helper, not electron-store: one value, zero dependencies,
 * straightforward to audit. The same userData root that holds secrets.json
 * holds this file, so backup/migration is unified.
 *
 * Multi-display awareness: we save the absolute screen coordinates Electron
 * provides; on restore we don't validate that those coordinates are still
 * on a connected display. Electron's BrowserWindow clamps off-screen
 * bounds to the nearest display, so the worst case is the window snapping
 * to a new monitor edge instead of opening behind a vanished one.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export async function loadWindowState(): Promise<WindowBounds | null> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<WindowBounds>;
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return null;
    }
    if (parsed.width < 320 || parsed.height < 240) return null;
    return {
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      width: parsed.width,
      height: parsed.height,
    };
  } catch {
    return null;
  }
}

export async function saveWindowState(bounds: WindowBounds): Promise<void> {
  try {
    await fs.writeFile(storePath(), JSON.stringify(bounds), 'utf8');
  } catch {
    // Best-effort. A failed save just means next launch uses defaults.
  }
}
