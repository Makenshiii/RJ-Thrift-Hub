import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  refreshAccount,
  registerAccount
} from '../api/auth.js';

const AuthContext = createContext(null);
const SESSION_KEY = 'rj-session-v1';

function readSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return session?.accessToken && session?.refreshToken ? session : null;
  } catch {
    return null;
  }
}

function persistSession(session) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    throw new Error('Your browser could not store this sign-in session. Check its storage settings and try again.');
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const token = session?.accessToken || null;

  const acceptSession = useCallback((nextSession) => {
    persistSession(nextSession);
    setSession(nextSession);
    setUser(nextSession?.user || null);
    setAuthError('');
  }, []);

  const clearSession = useCallback(() => {
    persistSession(null);
    setSession(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function synchronizeSession() {
      if (!session?.accessToken) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const currentUser = await getCurrentAccount(session.accessToken, controller.signal);
        if (active) {
          setUser(currentUser);
          setAuthError('');
        }
      } catch (error) {
        if (!active || error.name === 'AbortError') return;
        if (error.status === 401 && session.refreshToken) {
          try {
            const refreshed = await refreshAccount(session.refreshToken, controller.signal);
            if (active) {
              acceptSession(refreshed);
              setUser(refreshed.user);
            }
          } catch (refreshError) {
            if (active && refreshError.name !== 'AbortError') {
              clearSession();
              setAuthError(refreshError.message);
            }
          }
        } else {
          setAuthError(error.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    synchronizeSession();
    return () => {
      active = false;
      controller.abort();
    };
  }, [acceptSession, clearSession, session?.accessToken, session?.refreshToken]);

  const login = useCallback(async (credentials, signal) => {
    const nextSession = await loginAccount(credentials, signal);
    acceptSession(nextSession);
    return nextSession;
  }, [acceptSession]);

  const register = useCallback(async (details, signal) => {
    const result = await registerAccount(details, signal);
    if (!result.requiresEmailConfirmation) acceptSession(result);
    return result;
  }, [acceptSession]);

  const logout = useCallback(async () => {
    const current = session;
    try {
      if (current?.accessToken && current?.refreshToken) {
        await logoutAccount(current.accessToken, current.refreshToken);
      }
    } finally {
      clearSession();
    }
  }, [clearSession, session]);

  const value = useMemo(() => ({
    token,
    user,
    loading,
    authError,
    login,
    register,
    logout,
    clearSession
  }), [token, user, loading, authError, login, register, logout, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
