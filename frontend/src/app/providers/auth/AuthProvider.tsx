import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { getCurrentUser } from '@/modules/auth/api/auth.api';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { AuthContext } from './authContext';

export function AuthProvider({ children }: PropsWithChildren) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!accessToken || !isAuthenticated) return;

    void getCurrentUser()
      .then((currentUser) => login(currentUser))
      .catch(() => logout());
  }, [accessToken, isAuthenticated, login, logout]);

  return (
    <AuthContext.Provider value={{ user, accessToken, refreshToken, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
