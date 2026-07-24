import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from './auth.types';

export type { AppRole, AuthUser } from './auth.types';

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, tokens?: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
};

/**
 * Auth store persisted to localStorage via Zustand middleware — không đọc/ghi
 * localStorage trong actions (theo CLAUDE.md "Zustand store discipline").
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      login: (user, tokens) => {
        if (tokens) {
          localStorage.setItem('dong_da_access_token', tokens.accessToken);
          localStorage.setItem('dong_da_refresh_token', tokens.refreshToken);
        }

        set({
          user,
          accessToken: tokens?.accessToken ?? localStorage.getItem('dong_da_access_token'),
          refreshToken: tokens?.refreshToken ?? localStorage.getItem('dong_da_refresh_token'),
          isAuthenticated: true,
        });
      },
      logout: () => {
        localStorage.removeItem('dong_da_access_token');
        localStorage.removeItem('dong_da_refresh_token');
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'dong_da_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
