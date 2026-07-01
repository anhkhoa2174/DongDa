import {
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  MoneyCollectOutlined,
  SafetyCertificateOutlined,
  TransactionOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WalletOutlined,
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
    key: 'fund',
    icon: <WalletOutlined />,
    label: 'Quỹ',
    children: [
      { key: '/fund-management/central-fund', label: 'Quỹ Chung', path: '/fund-management/central-fund', allowedRoles: ['director', 'accountant', 'auditor'] },
      { key: '/cash-count/branch', label: 'Kiểm Quỹ', path: '/cash-count/branch' },
      { key: '/cash-count/central', label: 'Kiểm Quỹ Tổng', path: '/cash-count/central', allowedRoles: ['director', 'accountant', 'auditor'] },
    ],
  },
  {
    key: '/exchange-rate',
    icon: <DollarOutlined />,
    label: 'Tỷ Giá',
    path: '/exchange-rate',
  },
  {
    key: '/fund-transfer',
    icon: <UserSwitchOutlined />,
    label: 'Tiếp Quỹ',
    path: '/fund-transfer',
    allowedRoles: ['director', 'accountant'],
  },
  {
    key: 'debt-management',
    icon: <MoneyCollectOutlined />,
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
  {
    key: '/reconciliation',
    icon: <CheckSquareOutlined />,
    label: 'Đối Chiếu',
    path: '/reconciliation',
    allowedRoles: ['director', 'accountant', 'auditor'],
  },
  {
    key: '/reports',
    icon: <BarChartOutlined />,
    label: 'Báo Cáo',
    path: '/reports',
    allowedRoles: ['director', 'accountant', 'auditor'],
  },
  {
    key: '/audit-log',
    icon: <AuditOutlined />,
    label: 'Audit Log',
    path: '/audit-log',
    allowedRoles: ['director', 'accountant', 'auditor'],
  },
  {
    key: 'administration',
    icon: <SafetyCertificateOutlined />,
    label: 'Quản Trị',
    children: [
      { key: '/user-management/users', label: 'Người dùng', path: '/user-management/users', icon: <UserOutlined /> },
      { key: '/user-management/permissions', label: 'Phân quyền', path: '/user-management/permissions', icon: <FileSearchOutlined /> },
    ],
    allowedRoles: ['director'],
  },
];
