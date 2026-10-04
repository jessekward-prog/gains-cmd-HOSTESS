import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';

const NavigationContext = createContext(null);

// The "root" tab — back from here will exit the app (with double-tap confirm)
const ROOT_TAB = 'programs';

// Double-tap-to-exit window (ms)
const EXIT_CONFIRM_MS = 2000;

/**
 * NavigationProvider
 *
 * Replaces the ad-hoc useState tab management in App.jsx with a real
 * history-aware navigation stack. On Android, swipe-back now pops your
 * in-app stack instead of exiting the PWA.
 *
 * Exposes:
 *   - tab: current active tab
 *   - navigate(tab): go to a tab (pushes history)
 *   - goBack(): pop history (used internally + exposed for UI back buttons)
 *   - registerBackHandler(fn): temporarily intercept back (modals use this)
 *   - onExitAttempt: set a callback (toast) for double-tap-to-exit prompt
 */
export function NavigationProvider({ children, initialTab = ROOT_TAB, onExitAttempt }) {
  // In-memory stack of tabs the user visited, in order.
  // The last entry is the current tab.
  const [stack, setStack] = useState(() => {
    try {
      const saved = sessionStorage.getItem('gains-cmd-active-tab');
      if (saved) {
        sessionStorage.removeItem('gains-cmd-active-tab');
        return saved === ROOT_TAB ? [ROOT_TAB] : [ROOT_TAB, saved];
      }
    } catch {}
    return [initialTab];
  });

  const stackRef = useRef(stack);
  useEffect(() => { stackRef.current = stack; }, [stack]);

  const tab = stack[stack.length - 1];

  // Stack of registered back-handlers (e.g. open modals).
  // Most recently registered runs first. If it returns true, the back
  // event is considered handled and we don't pop the navigation stack.
  const backHandlersRef = useRef([]);

  // Track last time user tried to exit from root, for double-tap confirm.
  const lastExitAttemptRef = useRef(0);

  // Flag so our own history.back() calls don't get treated as user input.
  const programmaticPopRef = useRef(false);

  // ------------------------------------------------------------------
  // History API integration
  // ------------------------------------------------------------------

  // Seed the history. We replace the current entry with a sentinel (nav
  // index -1). Then we push one entry per tab in the stack. This guarantees
  // that even when the user is on the root tab, there's still a real
  // pushed entry behind them — so Android back fires `popstate` instead
  // of silently exiting the PWA. Our popstate handler intercepts and
  // either prompts for double-tap-exit or re-pushes the entry.
  useEffect(() => {
    try {
      window.history.replaceState({ navIndex: -1, sentinel: true }, '');
      for (let i = 0; i < stackRef.current.length; i++) {
        window.history.pushState({ navIndex: i, tab: stackRef.current[i] }, '');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for popstate (Android back gesture, hardware back button,
  // browser back button) and translate into in-app navigation.
  useEffect(() => {
    const handlePopState = (e) => {
      // Our own history.back() call — let it through silently.
      if (programmaticPopRef.current) {
        programmaticPopRef.current = false;
        return;
      }

      // 1. Let registered back-handlers (modals etc.) intercept first.
      const handlers = backHandlersRef.current;
      for (let i = handlers.length - 1; i >= 0; i--) {
        const handled = handlers[i]();
        if (handled) {
          // Re-push a history entry so the next back press will work again.
          try {
            const currentIndex = stackRef.current.length - 1;
            window.history.pushState(
              { navIndex: currentIndex, tab: stackRef.current[currentIndex] },
              ''
            );
          } catch {}
          return;
        }
      }

      // 2. If we have more than one tab on the stack, pop it.
      if (stackRef.current.length > 1) {
        setStack((prev) => prev.slice(0, -1));
        return;
      }

      // 3. We're at the root. Double-tap-to-exit.
      const now = Date.now();
      if (now - lastExitAttemptRef.current < EXIT_CONFIRM_MS) {
        // User confirmed exit — actually let the browser go back.
        programmaticPopRef.current = true;
        try { window.history.back(); } catch {}
        return;
      }

      // First exit attempt — prompt and re-push history so we stay in-app.
      lastExitAttemptRef.current = now;
      if (typeof onExitAttempt === 'function') {
        try { onExitAttempt(); } catch {}
      }
      try {
        window.history.pushState({ navIndex: 0, tab: stackRef.current[0] }, '');
      } catch {}
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onExitAttempt]);

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  const navigate = useCallback((nextTab) => {
    if (!nextTab) return;
    setStack((prev) => {
      const current = prev[prev.length - 1];
      if (current === nextTab) return prev;

      // If the target tab already exists earlier in the stack, treat
      // this as a "back to that tab" — trim the stack and pop history.
      const existingIndex = prev.indexOf(nextTab);
      if (existingIndex !== -1) {
        const popCount = prev.length - 1 - existingIndex;
        if (popCount > 0) {
          programmaticPopRef.current = true;
          try { window.history.go(-popCount); } catch {}
        }
        return prev.slice(0, existingIndex + 1);
      }

      // New tab — push a history entry.
      const nextStack = [...prev, nextTab];
      try {
        window.history.pushState(
          { navIndex: nextStack.length - 1, tab: nextTab },
          ''
        );
      } catch {}
      return nextStack;
    });
  }, []);

  const goBack = useCallback(() => {
    if (stackRef.current.length > 1) {
      // Let popstate handler do the work.
      try { window.history.back(); } catch {}
      return true;
    }
    return false;
  }, []);

  const registerBackHandler = useCallback((handler) => {
    backHandlersRef.current.push(handler);
    return () => {
      const idx = backHandlersRef.current.indexOf(handler);
      if (idx !== -1) backHandlersRef.current.splice(idx, 1);
    };
  }, []);

  const value = {
    tab,
    stack,
    navigate,
    goBack,
    canGoBack: stack.length > 1,
    registerBackHandler,
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider');
  return ctx;
}
