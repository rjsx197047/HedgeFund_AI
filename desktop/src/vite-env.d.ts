/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

interface EngineHandshakeBridge {
  port: number;
  token: string;
}

interface SecretListingBridge {
  key: string;
  hint: string;
  updatedAt: string;
}

interface SecretEntryBridge {
  hint: string;
  updatedAt: string;
  cipher: string;
}

interface SecretsAvailabilityBridge {
  available: boolean;
  filePath: string;
}

interface SecretsBridge {
  availability: () => Promise<SecretsAvailabilityBridge>;
  set: (key: string, value: string) => Promise<SecretEntryBridge>;
  get: (key: string) => Promise<string | null>;
  list: () => Promise<SecretListingBridge[]>;
  delete: (key: string) => Promise<boolean>;
}

type MenuChannel = 'menu:navigate' | 'menu:new-analysis' | 'menu:stop-stream';

interface TradingAgentsLabBridge {
  version: string;
  platform: NodeJS.Platform;
  getEngineHandshake: () => Promise<EngineHandshakeBridge>;
  secrets: SecretsBridge;
  onMenuCommand: (
    channel: MenuChannel,
    handler: (...args: unknown[]) => void,
  ) => () => void;
}

declare global {
  interface Window {
    tradingAgentsLab: TradingAgentsLabBridge;
  }
}

export {};
