// Axios instance — tất cả API call đều đi qua đây
// Layer: Infrastructure

import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Gắn accessToken vào mỗi request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Refresh token flow ───────────────────────────────────────
// Nhiều request fail 401 cùng lúc → chỉ refresh 1 lần, các request khác chờ
let refreshPromise: Promise<string> | null = null;

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('no refresh token');

  // Gọi /auth/refresh — KHÔNG đi qua apiClient để tránh đệ quy
  const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
  const { data } = await axios.post<RefreshResponse>(
    `${baseURL}/auth/refresh`,
    { refreshToken },
  );

  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
}

function clearAuthAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  if (globalThis.location.pathname !== '/login') {
    globalThis.location.href = '/login';
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original: (AxiosRequestConfig & { _retry?: boolean }) | undefined = error.config;
    if (!original) throw error;

    // Không retry cho chính endpoint refresh hoặc đã retry rồi
    if (
      error.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/login')
    ) {
      if (error.response?.status === 401) {
        clearAuthAndRedirect();
      }
      throw error;
    }

    original._retry = true;

    try {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;
      original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
      return apiClient(original);
    } catch {
      clearAuthAndRedirect();
      throw error;
    }
  },
);

export default apiClient;
