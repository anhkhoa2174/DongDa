import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { getCurrentUser, heartbeatWithApi } from '@/modules/auth/api/auth.api';
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

  useEffect(() => {
    if (!accessToken || !isAuthenticated) return;

    const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 phút — nhỏ hơn nhiều so với timeout 5 phút phía backend

    const interval = setInterval(() => {
      void heartbeatWithApi().catch((error) => {
        // Lỗi 401 sẽ được axios interceptor tự xử lý (refresh token hoặc logout) — không cần làm gì thêm ở đây.
        // Lỗi khác (mạng chập chờn...) bỏ qua, lần heartbeat kế tiếp sẽ thử lại.
        console.warn('Heartbeat thất bại:', error);
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [accessToken, isAuthenticated]);

  return (
    <AuthContext.Provider value={{ user, accessToken, refreshToken, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
