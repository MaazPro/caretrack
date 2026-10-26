import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from './api';
import type { User } from './types';

interface AuthContextValue { user: User | null; loading: boolean; signIn: (user: User, token: string) => void; signOut: () => void }
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!sessionStorage.getItem('caretrack_token')) { setLoading(false); return; }
    authApi.me().then(setUser).catch(() => { sessionStorage.removeItem('caretrack_token'); queryClient.clear(); }).finally(() => setLoading(false));
  }, [queryClient]);
  const signIn = (nextUser: User, token: string) => { queryClient.clear(); sessionStorage.setItem('caretrack_token', token); setUser(nextUser); };
  const signOut = () => { sessionStorage.removeItem('caretrack_token'); queryClient.clear(); setUser(null); };
  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('AuthProvider missing'); return context; }
