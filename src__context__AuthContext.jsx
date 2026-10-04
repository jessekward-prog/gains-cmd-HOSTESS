import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { checkAuth as apiCheckAuth } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // Single-user app: "logging out" just locks it — the PIN screen comes back.
  const logout = useCallback(() => {
    try { localStorage.removeItem('gains-cmd-user'); } catch {}
    window.location.href = '/auth/logout';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
