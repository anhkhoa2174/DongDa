export type AppRole = 'director' | 'accountant' | 'branch' | 'auditor';

export type AuthUser = {
  id: string;
  name: string;
  role: AppRole;
  branchId?: string;
  branchName?: string;
};
