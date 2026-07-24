import axios from 'axios';
import { runtimeConfig } from '@/shared/config/runtime';
import { useAuthStore } from '@/modules/auth/model/auth.store';

export const httpClient = axios.create({
  baseURL: runtimeConfig.apiBaseUrl,
  timeout: 30_000,
});

httpClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken ?? localStorage.getItem('dong_da_access_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };
    const status = error.response?.status;
    const refreshToken = useAuthStore.getState().refreshToken ?? localStorage.getItem('dong_da_refresh_token');

    if (status === 401 && refreshToken && !originalRequest?._retry && !originalRequest?.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;

      try {
        const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
          `${runtimeConfig.apiBaseUrl}/auth/refresh`,
          { refreshToken },
        );

        useAuthStore.setState({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        });
        localStorage.setItem('dong_da_access_token', data.accessToken);
        localStorage.setItem('dong_da_refresh_token', data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

        return httpClient(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
