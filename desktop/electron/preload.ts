import { contextBridge, ipcRenderer } from 'electron';

export interface EngineHandshake {
  port: number;
  token: string;
}

export interface SecretListing {
  key: string;
  hint: string;
  updatedAt: string;
}

export interface SecretEntry {
  hint: string;
  updatedAt: string;
  cipher: string;
}

export interface SecretsAvailability {
  available: boolean;
  filePath: string;
}

type MenuChannel =
  | 'menu:navigate'
  | 'menu:new-analysis'
  | 'menu:stop-stream'
  | 'menu:check-upstream';

export interface UpstreamCheckResultBridge {
  status: 'ok' | 'behind' | 'error';
  latestTag: string;
  upstreamHead: string;
  ourHead: string;
  behindCount: number;
  aheadCount: number;
  behindCommits: string[];
  checkedAt: string;
  error?: string;
  compareUrl: string;
}

export interface OAuthStartResult {
  success: boolean;
  email?: string;
  error?: string;
}

export interface OAuthStatus {
  connected: boolean;
  email?: string;
  expiresAt?: number;
  needsRefresh?: boolean;
}

export interface OAuthProgressEvent { message: string }
export interface OAuthPromptEvent { message: string; placeholder?: string }

export interface OAuthCredentialsBridge {
  access: string;
  refresh: string;
  expires: number;
  email?: string;
  /** Required for Codex backend's `chatgpt-account-id` header. */
  accountId?: string;
}

contextBridge.exposeInMainWorld('tradingAgentsLab', {
  version: '0.0.1',
  platform: process.platform,
  getEngineHandshake: (): Promise<EngineHandshake> =>
    ipcRenderer.invoke('engine:get-handshake'),
  // Fired by main when the engine exits unexpectedly (a crash). The renderer
  // uses this to drop its cached handshake so the next call re-fetches a fresh
  // port/token from a lazily-respawned engine. Returns an unsubscribe fn.
  onEngineExited: (handler: () => void): (() => void) => {
    const wrapped = () => handler();
    ipcRenderer.on('engine:exited', wrapped);
    return () => ipcRenderer.removeListener('engine:exited', wrapped);
  },
  secrets: {
    availability: (): Promise<SecretsAvailability> =>
      ipcRenderer.invoke('secrets:availability'),
    set: (key: string, value: string): Promise<SecretEntry> =>
      ipcRenderer.invoke('secrets:set', key, value),
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke('secrets:get', key),
    list: (): Promise<SecretListing[]> => ipcRenderer.invoke('secrets:list'),
    delete: (key: string): Promise<boolean> =>
      ipcRenderer.invoke('secrets:delete', key),
  },
  oauth: {
    openaiStart: (): Promise<OAuthStartResult> =>
      ipcRenderer.invoke('oauth:openai:start'),
    openaiStatus: (): Promise<OAuthStatus> =>
      ipcRenderer.invoke('oauth:openai:status'),
    openaiDisconnect: (): Promise<boolean> =>
      ipcRenderer.invoke('oauth:openai:disconnect'),
    openaiPromptResponse: (value: string): void =>
      ipcRenderer.send('oauth:openai:prompt-response', value),
    openaiCredentials: (): Promise<OAuthCredentialsBridge | null> =>
      ipcRenderer.invoke('oauth:openai:credentials'),
    onProgress: (handler: (event: OAuthProgressEvent) => void): (() => void) => {
      const wrapped = (_evt: Electron.IpcRendererEvent, event: OAuthProgressEvent) =>
        handler(event);
      ipcRenderer.on('oauth:openai:progress', wrapped);
      return () => ipcRenderer.removeListener('oauth:openai:progress', wrapped);
    },
    onPrompt: (handler: (event: OAuthPromptEvent) => void): (() => void) => {
      const wrapped = (_evt: Electron.IpcRendererEvent, event: OAuthPromptEvent) =>
        handler(event);
      ipcRenderer.on('oauth:openai:prompt', wrapped);
      return () => ipcRenderer.removeListener('oauth:openai:prompt', wrapped);
    },
  },
  onMenuCommand: (
    channel: MenuChannel,
    handler: (...args: unknown[]) => void,
  ): (() => void) => {
    const wrapped = (_evt: Electron.IpcRendererEvent, ...args: unknown[]) =>
      handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  checkUpstream: (): Promise<UpstreamCheckResultBridge> =>
    ipcRenderer.invoke('app:check-upstream'),
  shutdown: (): Promise<void> => ipcRenderer.invoke('app:shutdown'),
  restart: (): Promise<void> => ipcRenderer.invoke('app:restart'),
});
