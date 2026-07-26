import type { AppRole, AuthUser } from '../model/auth.types';

export const demoAccessTokenMock = 'demo-token';

export const demoDirectorUserMock: AuthUser = {
  id: 'director-001',
  name: 'Trần Văn Hùng',
  role: 'director',
};

export type MockAuthAccount = {
  username: string;
  password: string;
  roleLabel: string;
  user: AuthUser;
};

export const mockAuthAccounts: MockAuthAccount[] = [
  {
    username: 'director',
    password: '123456',
    roleLabel: 'Giám đốc',
    user: demoDirectorUserMock,
  },
  {
    username: 'ktth',
    password: '123456',
    roleLabel: 'Kế toán tổng hợp',
    user: {
      id: 'accountant-001',
      name: 'Nguyễn Minh Anh',
      role: 'accountant',
    },
  },
  {
    username: 'branch.nct',
    password: '123456',
    roleLabel: 'Chi nhánh Nguyễn Chí Thanh',
    user: {
      id: 'branch-001',
      name: 'Nguyễn Thị Lan',
      role: 'branch',
      branchId: 'nct',
      branchName: 'Chi nhánh Nguyễn Chí Thanh',
    },
  },
  {
    username: 'branch.xd',
    password: '123456',
    roleLabel: 'Chi nhánh Xã Đàn',
    user: {
      id: 'branch-002',
      name: 'Phạm Thanh Mai',
      role: 'branch',
      branchId: 'xd',
      branchName: 'Chi nhánh Xã Đàn',
    },
  },
  {
    username: 'auditor',
    password: '123456',
    roleLabel: 'Kiểm toán viên',
    user: {
      id: 'auditor-001',
      name: 'Lê Quốc Bảo',
      role: 'auditor',
    },
  },
];

export const mockAuthAccountByRole = mockAuthAccounts.reduce(
  (lookup, account) => ({
    ...lookup,
    [account.user.role]: account,
  }),
  {} as Record<AppRole, MockAuthAccount>,
);

export function authenticateMockAccount(username: string, password: string) {
  return mockAuthAccounts.find(
    (account) =>
      account.username.toLowerCase() === username.trim().toLowerCase() &&
      account.password === password,
  );
}
