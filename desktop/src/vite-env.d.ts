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

interface OAuthStartResultBridge {
  success: boolean;
  email?: string;
  error?: string;
}

interface OAuthStatusBridge {
  connected: boolean;
  email?: string;
  expiresAt?: number;
  needsRefresh?: boolean;
}

interface OAuthProgressEventBridge { message: string }
interface OAuthPromptEventBridge { message: string; placeholder?: string }

interface OAuthCredentialsBridge {
  access: string;
  refresh: string;
  expires: number;
  email?: string;
  accountId?: string;
}

interface OAuthBridge {
  openaiStart: () => Promise<OAuthStartResultBridge>;
  openaiStatus: () => Promise<OAuthStatusBridge>;
  openaiDisconnect: () => Promise<boolean>;
  openaiPromptResponse: (value: string) => void;
  openaiCredentials: () => Promise<OAuthCredentialsBridge | null>;
  onProgress: (handler: (event: OAuthProgressEventBridge) => void) => () => void;
  onPrompt: (handler: (event: OAuthPromptEventBridge) => void) => () => void;
}

type MenuChannel = 'menu:navigate' | 'menu:new-analysis' | 'menu:stop-stream';

interface TradingAgentsLabBridge {
  version: string;
  platform: NodeJS.Platform;
  getEngineHandshake: () => Promise<EngineHandshakeBridge>;
  secrets: SecretsBridge;
  oauth: OAuthBridge;
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
