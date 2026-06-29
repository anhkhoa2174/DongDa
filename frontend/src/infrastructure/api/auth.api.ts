// Auth API calls
// Layer: Infrastructure

import apiClient from './client';
import type { LoginResponse } from '@domain/types/user.types';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<LoginResponse>('/auth/login', payload).then((r) => r.data),

  logout: () =>
    apiClient.post('/auth/logout'),

  me: () =>
    apiClient.get<LoginResponse['user']>('/auth/me').then((r) => r.data),

  changePassword: (payload: ChangePasswordPayload) =>
    apiClient.patch('/auth/change-password', payload),
};
