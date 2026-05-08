import { contextBridge, ipcRenderer } from 'electron';

export interface EngineHandshake {
  port: number;
  token: string;
}

contextBridge.exposeInMainWorld('tradingAgentsLab', {
  version: '0.0.1',
  platform: process.platform,
  getEngineHandshake: (): Promise<EngineHandshake> =>
    ipcRenderer.invoke('engine:get-handshake'),
});

declare global {
  interface Window {
    tradingAgentsLab: {
      version: string;
      platform: NodeJS.Platform;
      getEngineHandshake: () => Promise<EngineHandshake>;
    };
  }
}
