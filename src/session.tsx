/**
 * v1 "auth": pick or register a user, remember their id in localStorage.
 * TODO(auth): swap for Supabase Auth session (supabase.auth.getUser()) — keep the same hook shape.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../shared/types';
import { api } from './api';

type Session = { user: User | null; setUser: (u: User | null) => void; ready: boolean };
const Ctx = createContext<Session>({ user: null, setUser: () => {}, ready: false });
const KEY = 'pl:userId';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = Number(localStorage.getItem(KEY));
    if (!id) { setReady(true); return; }
    api.users().then((us) => setUserState(us.find((u) => u.id === id) ?? null)).catch(() => {}).finally(() => setReady(true));
  }, []);
  const setUser = (u: User | null) => {
    if (u) localStorage.setItem(KEY, String(u.id)); else localStorage.removeItem(KEY);
    setUserState(u);
  };
  return <Ctx.Provider value={{ user, setUser, ready }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
