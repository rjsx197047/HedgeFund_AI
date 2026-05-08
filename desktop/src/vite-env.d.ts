/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

interface EngineHandshakeBridge {
  port: number;
  token: string;
}

interface TradingAgentsLabBridge {
  version: string;
  platform: NodeJS.Platform;
  getEngineHandshake: () => Promise<EngineHandshakeBridge>;
}

declare global {
  interface Window {
    tradingAgentsLab: TradingAgentsLabBridge;
  }
}

export {};
