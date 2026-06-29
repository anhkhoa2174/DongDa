// PrivateRoute — redirect về /login nếu chưa auth
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@application/stores/auth.store';

interface Props {
  children: React.ReactNode;
}

export function PrivateRoute({ children }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasToken = !!localStorage.getItem('accessToken');

  if (!isAuthenticated && !hasToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
