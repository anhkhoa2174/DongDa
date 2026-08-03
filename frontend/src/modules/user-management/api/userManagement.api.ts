import { httpClient } from '@/shared/api/httpClient';

export type UserRoleCode = 'ADMIN' | 'MANAGER' | 'STAFF' | 'AUDITOR';
export type CreatableUserRole = 'MANAGER' | 'STAFF';

export type UserDto = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRoleCode;
  branchId?: string;
  isActive: boolean;
  createdAt: string;
};

export type BranchDto = {
  id: string;
  code: string;
  name: string;
  type: 'HEAD_OFFICE' | 'BRANCH';
  address?: string | null;
  phone?: string | null;
};

export type CreateUserPayload = {
  username: string;
  email: string;
  password: string;
  fullName: string;
  role: CreatableUserRole;
  branchId: string;
};

export const userManagementApi = {
  users: () => httpClient.get<UserDto[]>('/users').then((response) => response.data),
  branches: () => httpClient.get<BranchDto[]>('/branches').then((response) => response.data),
  createUser: (payload: CreateUserPayload) =>
    httpClient.post<UserDto>('/users', payload).then((response) => response.data),
  updateUser: (id: string, payload: { isActive: boolean }) =>
    httpClient.patch<UserDto>(`/users/${id}`, payload).then((response) => response.data),
  deactivateUser: (id: string) =>
    httpClient.patch<UserDto>(`/users/${id}/deactivate`).then((response) => response.data),
};
