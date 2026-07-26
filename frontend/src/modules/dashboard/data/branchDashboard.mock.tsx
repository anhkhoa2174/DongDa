import {
  AlertOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { SubBalance } from '../components/BalanceOverviewCard';
import type { DashboardAlertItemProps } from '../components/DashboardAlertItem';
import type { DashboardKpi } from '../components/KpiGrid';

export type FundACurrency = {
  key: string;
  currency: string;
  name: string;
  amount: number;
  vndValue: number;
  status: 'normal' | 'low' | 'watch';
};

export const branchOverviewMock = {
  fallbackBranchName: 'NCT',
  amount: '325,000,000',
  statusTag: { label: 'CN NCT', color: 'blue' },
  caption: 'Quản lý VND, USD và Quỹ A của chi nhánh',
  sparklineBars: [46, 54, 49, 68, 62, 78, 88],
};

export const branchSubBalancesMock: SubBalance[] = [
  { label: 'VND tiền mặt', value: '325,000,000 ₫' },
  { label: 'USD tiền mặt', value: '$ 48,200' },
  { label: 'Quỹ A', value: '4 ngoại tệ' },
];

export const branchKpisMock: DashboardKpi[] = [
  { label: 'Giao dịch WU', value: '8', detail: '6 nhận tiền · 2 chi trả', icon: <ThunderboltOutlined />, tone: 'blue' },
  { label: 'Giao dịch MG', value: '2', detail: '1 nhận USD · 1 trả VND', icon: <SafetyCertificateOutlined />, tone: 'blue' },
  { label: 'Lợi nhuận TG hôm nay', value: '+620,000 ₫', detail: 'Từ mua/bán ngoại tệ', icon: <DollarOutlined />, tone: 'green' },
  { label: 'Sai lệch chờ xử lý', value: '0', detail: 'Quỹ cuối ca đang khớp', icon: <AlertOutlined />, tone: 'teal' },
];

export const branchFundsMock = [
  { label: 'VND', value: '325,000,000 ₫', change: '', tone: 'green' as const },
  { label: 'USD', value: '$ 48,200', change: '', tone: 'green' as const },
  { label: 'Quỹ A', value: '4 ngoại tệ', change: '', tone: 'gray' as const },
];

export const fundACurrenciesMock: FundACurrency[] = [
  { key: 'eur', currency: 'EUR', name: 'Euro', amount: 12400, vndValue: 360840000, status: 'normal' },
  { key: 'aud', currency: 'AUD', name: 'Australian Dollar', amount: 8250, vndValue: 139425000, status: 'normal' },
  { key: 'cad', currency: 'CAD', name: 'Canadian Dollar', amount: 4100, vndValue: 76998000, status: 'watch' },
  { key: 'gbp', currency: 'GBP', name: 'British Pound', amount: 1850, vndValue: 61383000, status: 'low' },
];

export const branchAlertsMock: DashboardAlertItemProps[] = [
  {
    tone: 'amber',
    icon: <AlertOutlined />,
    title: 'GBP sắp thiếu',
    description: 'Tồn GBP trong Quỹ A thấp hơn ngưỡng cảnh báo',
    action: 'Xem Quỹ A',
    path: '/fund-management/branch-funds',
  },
  {
    tone: 'blue',
    icon: <WarningOutlined />,
    title: 'Không có sai lệch',
    description: 'Kiểm quỹ gần nhất khớp với sổ chi nhánh',
    action: 'Kiểm quỹ',
    path: '/fund-management/cash-count',
  },
];

export const branchDashboardSummaryMock = {
  date: '17/06/2026',
  alertCount: 2,
};
