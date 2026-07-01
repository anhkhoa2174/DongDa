import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from './auth.types';

export type { AppRole, AuthUser } from './auth.types';

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
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
      isAuthenticated: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'dong_da_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
