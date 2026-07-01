import { create } from 'zustand';
import { demoAccessTokenMock, demoDirectorUserMock } from '../data/auth.mock';
import type { AuthUser } from './auth.types';

export type { AppRole, AuthUser } from './auth.types';

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
};

const storedToken = localStorage.getItem('dong_da_access_token');
const storedUser = localStorage.getItem('dong_da_auth_user');

function getStoredUser() {
  if (!storedToken) return null;
  if (!storedUser) return demoDirectorUserMock;

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    return demoDirectorUserMock;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: getStoredUser(),
  isAuthenticated: Boolean(storedToken),
  login: (user) => {
    localStorage.setItem('dong_da_access_token', demoAccessTokenMock);
    localStorage.setItem('dong_da_auth_user', JSON.stringify(user));
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('dong_da_access_token');
    localStorage.removeItem('dong_da_auth_user');
    set({ user: null, isAuthenticated: false });
  },
}));
