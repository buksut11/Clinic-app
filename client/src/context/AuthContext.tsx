import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { api } from '../lib/api';
import { User, Role } from '../lib/types';

interface AuthCtx {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('clinic_user');
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('clinic_token', data.token);
    localStorage.setItem('clinic_user', JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('clinic_token');
    localStorage.removeItem('clinic_user');
    setUser(null);
    location.href = '/login';
  }, []);

  const can = useCallback(
    (...roles: Role[]) => !!user && roles.includes(user.role),
    [user]
  );

  return <Ctx.Provider value={{ user, login, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
