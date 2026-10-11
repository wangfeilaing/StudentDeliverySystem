'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User { id: number; username: string; display_name: string; role: string; avatar_path: string | null; phone: string; }

const UserContext = createContext<{
  user: User | null;
  loading: boolean;
  impersonating: boolean;
  login: (u: User) => void;
  logout: () => void;
  switchUser: (targetUserId: number) => Promise<void>;
  switchBack: () => Promise<void>;
}>({
  user: null, loading: true, impersonating: false,
  login: () => {}, logout: () => {},
  switchUser: async () => {}, switchBack: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          setImpersonating(data.impersonating || false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((u: User) => {
    setUser(u);
    setImpersonating(false);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setImpersonating(false);
    window.location.href = '/login';
  }, []);

  const switchUser = useCallback(async (targetUserId: number) => {
    const res = await fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || '切换失败'); }
    const data = await res.json();
    setUser(data.user);
    setImpersonating(true);
    window.location.reload();
  }, []);

  const switchBack = useCallback(async () => {
    await fetch('/api/auth/switch-back', { method: 'POST' });
    setImpersonating(false);
    window.location.reload();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, impersonating, login, logout, switchUser, switchBack }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
