import {
  AlertOutlined,
  BuildOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { SubBalance } from '../components/BalanceOverviewCard';
import type { DashboardAlertItemProps } from '../components/DashboardAlertItem';
import type { DashboardKpi } from '../components/KpiGrid';

export type BranchStatus = {
  key: string;
  branch: string;
  shiftStatus: 'open' | 'closed';
  vndBalance: number;
  usdBalance: number;
  todayTransactions: number;
  revenueToday: number;
  profitToday: number;
  manager: string;
  riskLevel: 'normal' | 'watch' | 'risk';
  discrepancy: 'matched' | 'warning' | 'danger' | 'none';
  discrepancyLabel: string;
};

export const companyOverviewMock = {
  eyebrow: 'Tổng vốn công ty',
  amount: '12,485,320,000',
  statusTag: { label: '+2.3%', color: 'green' },
  caption: 'so hôm qua · +287,420,000 ₫',
  sparklineBars: [40, 55, 48, 70, 65, 80, 95],
};

export const companySubBalancesMock: SubBalance[] = [
  { label: 'VND tiền mặt', value: '1,400,020,000 ₫' },
  { label: 'USD tiền mặt', value: '$ 187,420' },
  { label: 'Ngân hàng', value: '8,235,300,000 ₫' },
  { label: 'Công nợ WU/MG', value: '$ 42,180' },
];

export const companyKpisMock: DashboardKpi[] = [
  { label: 'Giao Dịch', value: '47', detail: 'WU: 32 · MG: 8 · NT: 7', icon: <ThunderboltOutlined />, tone: 'blue' },
  { label: 'Giá trị giao dịch', value: '+2,220,000 ₫', detail: '+12% vs trung bình tuần', icon: <DollarOutlined />, tone: 'green' },
  { label: 'Sai lệch chờ xử lý', value: '3', detail: '1 lớn · 2 nhỏ', icon: <AlertOutlined />, tone: 'amber' },
  { label: 'Chi nhánh đang mở', value: '4 / 5', detail: 'Bảy Hiền chưa mở', icon: <BuildOutlined />, tone: 'teal' },
];

export const branchStatusesMock: BranchStatus[] = [
  { key: 'nct', branch: 'NCT', manager: 'Nguyễn Thị Lan', shiftStatus: 'open', vndBalance: 325000000, usdBalance: 48200, todayTransactions: 12, revenueToday: 820000000, profitToday: 2860000, riskLevel: 'normal', discrepancy: 'matched', discrepancyLabel: 'Khớp' },
  { key: 'tao-dan', branch: 'Tao Đàn', manager: 'Trần Minh Quân', shiftStatus: 'open', vndBalance: 187420000, usdBalance: 32500, todayTransactions: 9, revenueToday: 540000000, profitToday: 1720000, riskLevel: 'watch', discrepancy: 'warning', discrepancyLabel: '+25,000 ₫' },
  { key: 'le-hong-phong', branch: 'Lê Hồng Phong', manager: 'Vũ Hoàng Nam', shiftStatus: 'open', vndBalance: 412800000, usdBalance: 41800, todayTransactions: 11, revenueToday: 760000000, profitToday: 2480000, riskLevel: 'normal', discrepancy: 'matched', discrepancyLabel: 'Khớp' },
  { key: 'bay-hien', branch: 'Bảy Hiền', manager: 'Ngô Bảo Trâm', shiftStatus: 'closed', vndBalance: 198500000, usdBalance: 28400, todayTransactions: 0, revenueToday: 0, profitToday: 0, riskLevel: 'watch', discrepancy: 'none', discrepancyLabel: '-' },
  { key: 'an-dong', branch: 'An Đông', manager: 'Phạm Thanh Mai', shiftStatus: 'open', vndBalance: 276300000, usdBalance: 36520, todayTransactions: 15, revenueToday: 910000000, profitToday: 3050000, riskLevel: 'risk', discrepancy: 'danger', discrepancyLabel: '-180,000 ₫' },
];

export const companyExchangeRatesMock = [
  { label: 'Paid (WU/MG) Bán', value: '25,650', adjustment: '±20', tone: 'gray' as const },
  { label: 'Paid Mua', value: '25,580', adjustment: '±20', tone: 'gray' as const },
  { label: 'Giá Bán', value: '25,720', adjustment: '±30', tone: 'gray' as const },
  { label: 'Giá Mua', value: '25,600', adjustment: '±30', tone: 'gray' as const },
  { label: 'EUR Mua/Bán', value: '29,000 / 29,400', adjustment: '±100', tone: 'gray' as const },
  { label: 'AUD Mua/Bán', value: '16,650 / 17,050', adjustment: '±80', tone: 'gray' as const },
  { label: 'JPY Mua/Bán', value: '167 / 174', adjustment: '±2', tone: 'gray' as const },
  { label: 'GBP Mua/Bán', value: '33,800 / 34,400', adjustment: '±150', tone: 'gray' as const },
];

export const companyBusinessKpisMock = [
  { label: 'Doanh số hôm nay', value: '3.03 tỷ ₫', detail: '+14.2% so hôm qua', icon: <DollarOutlined />, tone: 'green' as const },
  { label: 'Lợi nhuận tạm tính', value: '10.11 triệu ₫', detail: 'WU/MG + ngoại tệ', icon: <ThunderboltOutlined />, tone: 'blue' as const },
  { label: 'Biên lợi nhuận', value: '0.33%', detail: '+0.04 điểm %', icon: <BuildOutlined />, tone: 'teal' as const },
  { label: 'Cảnh báo vận hành', value: '2', detail: '1 rủi ro · 1 cần theo dõi', icon: <AlertOutlined />, tone: 'amber' as const },
];

export const companyRevenueTrendMock = [
  { day: 'T2', revenue: 2.42, profit: 7.4 },
  { day: 'T3', revenue: 2.78, profit: 8.1 },
  { day: 'T4', revenue: 2.56, profit: 7.8 },
  { day: 'T5', revenue: 3.12, profit: 9.2 },
  { day: 'T6', revenue: 3.03, profit: 10.1 },
  { day: 'T7', revenue: 2.84, profit: 8.7 },
  { day: 'CN', revenue: 2.35, profit: 6.9 },
];

export const companyTransactionMixMock = [
  { name: 'WU', value: 32 },
  { name: 'MG', value: 8 },
  { name: 'Ngoại tệ', value: 7 },
  { name: 'Chuyển tiền', value: 5 },
];

export const companyAlertsMock: DashboardAlertItemProps[] = [
  {
    tone: 'red',
    icon: <WarningOutlined />,
    title: 'Chênh lệch lớn — CN An Đông',
    description: 'Thiếu 180,000 ₫ cuối ca',
    action: 'Xem chi tiết',
    path: '/shift-management/active-shift',
  },
  {
    tone: 'amber',
    icon: <ClockCircleOutlined />,
    title: 'CN Bảy Hiền chưa mở ca',
    description: 'Trễ 45 phút so quy định',
    action: 'Kiểm tra ca',
    path: '/shift-management/active-shift',
  },
];

export const companyRatesSummaryMock = {
  date: '17/06/2026',
  alertCount: 3,
  status: 'ACTIVE',
  metadata: 'KTTH nhập tay 07:35 · Giám đốc duyệt 07:42 · Đã thay đổi 2 lần hôm nay',
};
