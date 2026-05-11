// ─────────────────────────────────────────────────────────────────────────────
// browser-bridge-mock — inject a no-op `window.tradingAgentsLab` when the
// renderer is opened in a regular browser (no Electron preload, no IPC).
//
// Use case: handing the Vite dev URL (http://localhost:5174) to an external
// UI testing agent. Without this mock the first call into the secrets /
// engine-handshake bridge throws and crashes the page. With it, the UI
// flows work and bridge-dependent code surfaces clean user-facing errors
// (e.g. "no provider configured") instead of stack traces.
//
// This is only installed when window.tradingAgentsLab is missing — inside
// real Electron it does nothing.
// ─────────────────────────────────────────────────────────────────────────────

export function installBrowserBridgeMockIfNeeded(): void {
  if (typeof window === 'undefined') return;
  if (window.tradingAgentsLab) return; // real Electron preload won — skip.

  // Use plain in-memory localStorage-backed secrets so anything the user
  // saves in the browser session persists across reloads of the same tab.
  // Clears with the tab — no Keychain involvement.
  const PREFIX = 'browser-mock-secret:';
  const listAll = () =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));

  const noopUnsubscribe = () => () => {};

  // Cast through unknown — the mock satisfies the same shape as the real
  // bridge but skips IPC implementation details. TypeScript can't verify
  // method-by-method without re-declaring the entire interface.
  (window as unknown as { tradingAgentsLab: unknown }).tradingAgentsLab = {
    version: 'browser-mock',
    platform: 'darwin',

    getEngineHandshake: async () => {
      // No engine in the browser. Return a sentinel that will make any
      // downstream fetch fail with a clean network error rather than
      // succeeding with garbage.
      throw new Error('No engine available in browser preview mode.');
    },

    secrets: {
      availability: async () => ({
        available: false,
        filePath: '(browser preview — no keychain)',
      }),
      set: async (key: string, value: string) => {
        localStorage.setItem(PREFIX + key, value);
        return {
          hint: value.slice(-4),
          updatedAt: new Date().toISOString(),
          cipher: '(plain — browser preview)',
        };
      },
      get: async (key: string) => localStorage.getItem(PREFIX + key),
      list: async () =>
        listAll().map((key) => ({
          key,
          hint: (localStorage.getItem(PREFIX + key) ?? '').slice(-4),
          updatedAt: new Date().toISOString(),
        })),
      delete: async (key: string) => {
        const existed = localStorage.getItem(PREFIX + key) !== null;
        localStorage.removeItem(PREFIX + key);
        return existed;
      },
    },

    oauth: {
      openaiStart: async () => ({
        success: false,
        error: 'OAuth requires Electron (browser preview mode).',
      }),
      openaiStatus: async () => ({ connected: false }),
      openaiDisconnect: async () => false,
      openaiPromptResponse: () => {
        /* no-op */
      },
      openaiCredentials: async () => null,
      onProgress: noopUnsubscribe(),
      onPrompt: noopUnsubscribe(),
    },

    onMenuCommand: () => {
      // No native menu in the browser — return a no-op unsubscribe.
      return () => {};
    },

    checkUpstream: async () => ({
      status: 'error' as const,
      latestTag: '',
      upstreamHead: '',
      ourHead: '',
      behindCount: 0,
      aheadCount: 0,
      behindCommits: [],
      checkedAt: new Date().toISOString(),
      error: 'Upstream check requires Electron.',
      compareUrl: 'https://github.com/TauricResearch/TradingAgents',
    }),

    shutdown: async () => {
      window.close();
    },
    restart: async () => {
      window.location.reload();
    },
  };

  // Hint to the test agent / curious dev that we're running outside Electron.
  // Console-only — no UI banner so screenshots stay clean.
  // eslint-disable-next-line no-console
  console.info(
    '[TradingAgentsLab] Running in browser preview mode. Electron IPC is mocked; debates cannot actually run.',
  );
}
