import {
  BankOutlined,
  DashboardOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  MoneyCollectOutlined,
  TransactionOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import type { AppMenuItem } from '@/shared/types/navigation';

export const navigationItems: AppMenuItem[] = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    path: '/dashboard',
  },
  {
    key: '/shift-management/active-shift',
    icon: <FieldTimeOutlined />,
    label: 'Ca Làm Việc',
    path: '/shift-management/active-shift',
    allowedRoles: ['branch'],
  },
  {
    key: '/transactions',
    icon: <TransactionOutlined />,
    label: 'Giao Dịch',
    path: '/transactions',
  },
  {
    key: 'fund-management',
    icon: <MoneyCollectOutlined />,
    label: 'Quỹ chung',
    children: [
      { key: '/fund-management/central-fund', label: 'Quỹ Chung', path: '/fund-management/central-fund', allowedRoles: ['director', 'accountant', 'auditor'] },
    ],
  },
  {
    key: '/fund-transfer',
    icon: <UserSwitchOutlined />,
    label: 'Tiếp Quỹ',
    path: '/fund-transfer',
    allowedRoles: ['director', 'accountant'],
  },
  {
    key: 'branch-management',
    icon: <BankOutlined />,
    label: 'Chi Nhánh',
    children: [
      { key: '/branch-management/branches', label: 'Danh sách', path: '/branch-management/branches' },
    ],
    allowedRoles: ['director', 'accountant', 'auditor'],
  },
  {
    key: '/exchange-rate',
    icon: <DollarOutlined />,
    label: 'Tỷ Giá',
    path: '/exchange-rate',
  },
  {
    key: 'debt-management',
    icon: <FileSearchOutlined />,
    label: 'Công Nợ',
    children: [
      { key: '/debt-management/debt-list', label: 'Danh sách', path: '/debt-management/debt-list' },
    ],
    allowedRoles: ['director', 'accountant', 'auditor'],
  },
  {
    key: 'bank-management',
    icon: <BankOutlined />,
    label: 'Ngân Hàng',
    children: [
      { key: '/bank-management/accounts', label: 'Tài khoản', path: '/bank-management/accounts' },
    ],
    allowedRoles: ['director', 'accountant', 'auditor'],
  },
];
