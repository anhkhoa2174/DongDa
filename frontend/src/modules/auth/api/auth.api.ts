import { httpClient } from '@/shared/api/httpClient';
import type { AppRole, AuthUser, BackendRole } from '../model/auth.types';

type BackendUser = {
  id: string;
  username: string;
  email?: string | null;
  fullName: string;
  role: BackendRole;
  branchId?: string | null;
  branchName?: string | null;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: BackendUser;
};

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

const backendPermissionByRole: Record<BackendRole, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'transaction:read',
    'transaction:create',
    'transaction:approve',
    'shift:read',
    'shift:open',
    'shift:close',
    'exchange-rate:read',
    'report:read',
    'report:export',
    'capital-transfer:create',
    'capital-transfer:read',
    'user:read',
  ],
  STAFF: [
    'transaction:read',
    'transaction:create',
    'shift:read',
    'shift:open',
    'shift:close',
    'exchange-rate:read',
    'capital-transfer:create',
    'capital-transfer:read',
  ],
  AUDITOR: [
    'transaction:read',
    'shift:read',
    'exchange-rate:read',
    'report:read',
    'report:export',
    'audit-log:read',
  ],
};

function mapBackendRole(role: BackendRole): AppRole {
  const roleMap: Record<BackendRole, AppRole> = {
    ADMIN: 'director',
    MANAGER: 'accountant',
    STAFF: 'branch',
    AUDITOR: 'auditor',
  };

  return roleMap[role];
}

export function mapBackendUser(user: BackendUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? undefined,
    name: user.fullName,
    role: mapBackendRole(user.role),
    backendRole: user.role,
    permissions: backendPermissionByRole[user.role],
    branchId: user.branchId ?? undefined,
    branchName: user.branchName ?? undefined,
  };
}

export async function loginWithApi(input: { username: string; password: string }) {
  const { data } = await httpClient.post<LoginResponse>('/auth/login', input);

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: mapBackendUser(data.user),
  };
}

export async function getCurrentUser() {
  const { data } = await httpClient.get<BackendUser>('/auth/me');
  return mapBackendUser(data);
}

export async function refreshAuthToken(refreshToken: string) {
  const { data } = await httpClient.post<RefreshResponse>('/auth/refresh', { refreshToken });
  return data;
}

export async function logoutWithApi() {
  await httpClient.post('/auth/logout');
}

export async function changePasswordWithApi(input: { currentPassword: string; newPassword: string }) {
  await httpClient.patch('/auth/change-password', input);
}
