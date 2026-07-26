export type AppRole = 'director' | 'accountant' | 'branch' | 'auditor';
export type BackendRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'AUDITOR';

export type AuthUser = {
  id: string;
  username?: string;
  name: string;
  role: AppRole;
  backendRole?: BackendRole;
  permissions?: string[];
  branchId?: string;
  branchName?: string;
};
