import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { checkAuth as apiCheckAuth, login as apiLogin, register as apiRegister, resetPassword as apiReset } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveryPhrase, setRecoveryPhrase] = useState(null);
  // Track whether we need to run check() after phrase dismissal
  const pendingAuthCheck = useRef(false);

  const check = useCallback(async () => {
    try {
      const data = await apiCheckAuth();
      if (data.authenticated) {
        setUser(data.user);
        try { localStorage.setItem('gains-cmd-user', JSON.stringify(data.user)); } catch {}
      } else {
        setUser(null);
        try { localStorage.removeItem('gains-cmd-user'); } catch {}
      }
    } catch (e) {
      // Offline (fetch itself failed): stay signed in as the last known user
      // so a workout can carry on; a real "not authenticated" lands above.
      let cached = null;
      if (e instanceof TypeError) { try { cached = JSON.parse(localStorage.getItem('gains-cmd-user')); } catch {} }
      setUser(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    if (data.success) {
      await check();
    }
    return data;
  }, [check]);

  const register = useCallback(async (email, password, username) => {
    const data = await apiRegister(email, password, username);
    if (data.success && data.recoveryPhrase) {
      // Show recovery phrase FIRST — don't authenticate yet
      // The server already created the session, but we hold off on
      // setting `user` so the AuthPage stays visible with the phrase screen
      setRecoveryPhrase(data.recoveryPhrase);
      pendingAuthCheck.current = true;
      // Do NOT call check() here — wait until user dismisses the phrase
    }
    return data;
  }, []);

  const resetPwd = useCallback(async (email, phrase, newPwd) => {
    const data = await apiReset(email, phrase, newPwd);
    if (data.success && data.newRecoveryPhrase) {
      setRecoveryPhrase(data.newRecoveryPhrase);
    }
    return data;
  }, []);

  const clearPhrase = useCallback(() => {
    setRecoveryPhrase(null);
    // Now that the user has saved their phrase, complete authentication
    if (pendingAuthCheck.current) {
      pendingAuthCheck.current = false;
      check();
    }
  }, [check]);

  const logout = useCallback(() => {
    // The next person on this device shouldn't inherit (and push) our look.
    try { localStorage.removeItem('gains-cmd-appearance-at'); localStorage.removeItem('gains-cmd-user'); } catch {}
    window.location.href = '/auth/logout';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, resetPwd, logout, recoveryPhrase, clearPhrase }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
