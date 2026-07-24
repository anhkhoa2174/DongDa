import { createContext } from 'react';
import type { AuthUser } from '@/modules/auth/model/auth.store';

export type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, tokens?: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
