// Domain types: User
// Mirror từ backend domain — không import gì từ React/axios

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
  AUDITOR = 'AUDITOR',
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  branchId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: Omit<User, 'isActive' | 'createdAt'>;
}

// Helper: role có quyền quản lý toàn hệ thống không
export function isGlobalRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.AUDITOR;
}

export function canManageBranch(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}
