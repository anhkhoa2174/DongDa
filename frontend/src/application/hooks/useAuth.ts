// useAuth hook — business logic auth
// Layer: Application

import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@infra/api/auth.api';
import { useAuthStore } from '../stores/auth.store';

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.user as any, data.accessToken, data.refreshToken);
      navigate('/dashboard');
    },
  });
}

export function useLogout() {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearAuth();
      navigate('/login');
    },
  });
}

export function useMe() {
  const { setAuth, isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const user = await authApi.me();
      // Refresh user info trong store
      const accessToken = localStorage.getItem('accessToken') ?? '';
      const refreshToken = localStorage.getItem('refreshToken') ?? '';
      setAuth(user as any, accessToken, refreshToken);
      return user;
    },
    enabled: !!localStorage.getItem('accessToken'),
    retry: false,
  });
}
