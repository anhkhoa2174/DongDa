// Domain Entity: User
// Layer: Domain
//
// Phân quyền đơn giản — giai đoạn đầu:
//   ADMIN       : 1 tài khoản, toàn quyền hệ thống
//   MANAGER     : KTTH — quản lý nghiệp vụ toàn hệ thống
//   STAFF       : Nhân viên chi nhánh — nhập giao dịch, kiểm tiền
//   AUDITOR     : Chỉ đọc, không tác động dữ liệu

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
  AUDITOR = 'AUDITOR',
}

// ADMIN/GĐ, MANAGER/KTTH và AUDITOR được xem toàn hệ thống.
export const GLOBAL_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.AUDITOR];
export const BRANCH_ROLES: UserRole[] = [UserRole.STAFF];

// Quyền theo role
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.ADMIN]: ['*'],  // full access
  [UserRole.MANAGER]: [
    'transaction:read', 'transaction:create', 'transaction:update', 'transaction:void', 'transaction:approve',
    'shift:read',
    'exchange-rate:read', 'exchange-rate:manage', 'exchange-rate:approve',
    'report:read', 'report:export',
    'capital-transfer:create', 'capital-transfer:read',
    'debt:settle',
    'user:read',
  ],
  [UserRole.STAFF]: [
    'transaction:read', 'transaction:create',
    'shift:read', 'shift:open', 'shift:close',
    'exchange-rate:read',
    'capital-transfer:create', 'capital-transfer:read',
  ],
  [UserRole.AUDITOR]: [
    'transaction:read',
    'shift:read',
    'exchange-rate:read',
    'report:read', 'report:export',
    'audit-log:read',
  ],
};

export interface User {
  id: string;
  username: string;
  email?: string;
  password: string;   // bcrypt hashed, không bao giờ expose ra ngoài
  fullName: string;
  role: UserRole;
  branchId?: string;  // ADMIN/MANAGER/AUDITOR thường gắn Hội sở; STAFF gắn chi nhánh làm việc
  branchName?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Kiểm tra quyền truy cập chi nhánh (NF3 — enforce ở backend)
export function canAccessBranch(user: User, targetBranchId: string): boolean {
  if (GLOBAL_ROLES.includes(user.role)) return true;
  return user.branchId === targetBranchId;
}

export function hasPermission(user: User, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[user.role];
  return perms.includes('*') || perms.includes(permission);
}
