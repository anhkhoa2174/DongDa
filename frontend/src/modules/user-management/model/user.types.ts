export type UserRoleCode = 'director' | 'accountant' | 'branch_manager' | 'branch_staff' | 'auditor';

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';

export type AppUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  role: UserRoleCode;
  branchCode?: string;
  branchName?: string;
  status: UserStatus;
  twoFactorEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
};

export type UserActivityLog = {
  id: string;
  userId: string;
  action: string;
  target: string;
  ip: string;
  at: string;
};
