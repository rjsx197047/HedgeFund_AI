import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('tradingAgentsLab', {
  version: '0.0.1',
  platform: process.platform,
});

declare global {
  interface Window {
    tradingAgentsLab: {
      version: string;
      platform: NodeJS.Platform;
    };
  }
}
