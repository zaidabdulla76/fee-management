import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

function clearSessionStorage() {
  localStorage.removeItem('fee_token');
  localStorage.removeItem('fee_user');
  // Keep fee_year_id / sidebar preference — not sensitive identity data
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('fee_token'));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fee_user') || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then((res) => {
        setUser(res.data);
        localStorage.setItem('fee_user', JSON.stringify(res.data));
      })
      .catch(() => {
        clearSessionStorage();
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const logout = useCallback(() => {
    clearSessionStorage();
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await authApi.login(username, password);
    localStorage.setItem('fee_token', data.token);
    localStorage.setItem('fee_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      login,
      logout,
    }),
    [token, user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
