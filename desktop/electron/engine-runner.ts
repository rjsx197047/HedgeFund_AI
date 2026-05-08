import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';

export interface EngineHandshake {
  port: number;
  token: string;
}

let child: ChildProcess | null = null;
let handshakePromise: Promise<EngineHandshake> | null = null;

export function startEngine(): Promise<EngineHandshake> {
  if (handshakePromise) return handshakePromise;

  // app.getAppPath() in dev points at <repo>/desktop. The Python sidecar lives
  // at <repo>/engine/.venv/bin/python and the `engine` package is importable
  // when cwd = repo root (python -m engine resolves the package via sys.path[0]).
  const repoRoot = path.resolve(app.getAppPath(), '..');
  const python = path.join(repoRoot, 'engine', '.venv', 'bin', 'python');

  child = spawn(python, ['-m', 'engine'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  handshakePromise = new Promise<EngineHandshake>((resolve, reject) => {
    if (!child || !child.stdout || !child.stderr) {
      reject(new Error('engine: failed to spawn child process'));
      return;
    }

    const onFirstChunk = (buf: Buffer) => {
      const firstLine = buf.toString().split('\n')[0]?.trim();
      if (!firstLine) {
        reject(new Error('engine: empty handshake'));
        return;
      }
      try {
        const parsed = JSON.parse(firstLine) as EngineHandshake;
        if (typeof parsed.port !== 'number' || typeof parsed.token !== 'string') {
          throw new Error('handshake missing port/token');
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`engine: invalid handshake line: ${firstLine}`));
      }
    };

    child.stdout.once('data', onFirstChunk);

    child.on('error', (err) => reject(err));
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        // Surface only if handshake hasn't resolved yet; otherwise ignore.
        reject(new Error(`engine exited early with code ${code}`));
      }
    });

    // Tee uvicorn logs to main-process console for dev visibility.
    child.stderr.on('data', (buf: Buffer) => {
      process.stderr.write(`[engine] ${buf.toString()}`);
    });
  });

  return handshakePromise;
}

export function stopEngine(): void {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
    handshakePromise = null;
  }
}
