import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'vaultdeal_jwt';

function parseJwt(token) {
  try {
    // JWT is base64url encoded — decode the payload (middle segment)
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function loadUser() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = parseJwt(token);
    // Check expiry
    if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return { userId: payload.userId, steamId: payload.steamId, personaName: payload.personaName, avatarUrl: payload.avatarUrl };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadUser());

  const login = useCallback((token) => {
    localStorage.setItem(TOKEN_KEY, token);
    const payload = parseJwt(token);
    if (payload) {
      setUser({ userId: payload.userId, steamId: payload.steamId, personaName: payload.personaName, avatarUrl: payload.avatarUrl });
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    // Also clear any cached profile/library data
    Object.keys(localStorage)
      .filter((k) => k.startsWith('vaultdeal_'))
      .forEach((k) => localStorage.removeItem(k));
    setUser(null);
  }, []);

  const getToken = useCallback(() => localStorage.getItem(TOKEN_KEY), []);

  return (
    <AuthContext.Provider value={{ user, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
