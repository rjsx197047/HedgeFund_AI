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

type MenuChannel = 'menu:navigate' | 'menu:new-analysis' | 'menu:stop-stream';

contextBridge.exposeInMainWorld('tradingAgentsLab', {
  version: '0.0.1',
  platform: process.platform,
  getEngineHandshake: (): Promise<EngineHandshake> =>
    ipcRenderer.invoke('engine:get-handshake'),
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
  onMenuCommand: (
    channel: MenuChannel,
    handler: (...args: unknown[]) => void,
  ): (() => void) => {
    const wrapped = (_evt: Electron.IpcRendererEvent, ...args: unknown[]) =>
      handler(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
