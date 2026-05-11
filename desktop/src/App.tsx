import { useEffect } from 'react';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { useSessionStore, useView } from '@/store/useSessionStore';
import { Views } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// App — top-level view router.
//
// Two views (Home, Dashboard) backed by `useSessionStore.view`. No
// react-router: transitions happen as side effects of session actions
// (`startNewRun`, `selectRun`, `goHome`). When deep-linking matters, we can
// swap this for a `<Routes>` block and the store API stays.
//
// Native menu accelerators (Cmd+N for new analysis, etc.) come in over IPC
// via `window.tradingAgentsLab.onMenuCommand` and get translated into store
// actions here.
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const view = useView();
  const goHome = useSessionStore((s) => s.goHome);

  useEffect(() => {
    const bridge = window.tradingAgentsLab;
    if (!bridge?.onMenuCommand) return;

    const unsubNew = bridge.onMenuCommand('menu:new-analysis', () => {
      goHome();
    });

    const unsubNav = bridge.onMenuCommand('menu:navigate', (...args) => {
      const target = typeof args[0] === 'string' ? args[0] : '';
      // The old shell had four routes — for the new shell, anything that
      // wasn't Analyze maps to Dashboard; Analyze maps to Home. Keeps the
      // bundled menu working without an Electron-main rewrite on Day 1.
      if (target === 'analyze') goHome();
    });

    return () => {
      unsubNew();
      unsubNav();
    };
  }, [goHome]);

  return (
    <div className="app-root flex h-full w-full">
      {view === Views.Home ? <Home /> : <Dashboard />}
    </div>
  );
}

export default App;
