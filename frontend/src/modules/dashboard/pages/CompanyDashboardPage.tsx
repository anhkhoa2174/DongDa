import {
  AlertOutlined,
  BankOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  FileSearchOutlined,
  MoneyCollectOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Alert, Card, Col, Empty, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDateTime, formatExchangeRate, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { getCurrencyMetadata } from '@/shared/constants/currencies';
import type { CompanyDashboardDto, SummaryDto } from '@/modules/reports/api/summary.api';
import { useCompanyDashboard, useSummary } from '@/modules/reports/hooks/useSummary';
import { BalanceOverviewCard } from '../components/BalanceOverviewCard';
import { KpiGrid } from '../components/KpiGrid';

type BranchStatus = CompanyDashboardDto['branches'][number];
type CompanyExchangeRate = {
  id: string;
  label: string;
  country: string;
  value: string;
  effectiveFrom: string;
};
type OperationSummaryRow = {
  key: 'WU' | 'MG' | 'FX';
  operation: string;
  transactionCount: number;
  totalUsd: number | null;
  totalVnd: number;
  resultValue: number | null;
  resultLabel: string;
  debtUsd: number | null;
};

const branchColumns: ColumnsType<BranchStatus> = [
  {
    title: 'Chi nhánh',
    dataIndex: 'code',
    fixed: 'left',
    render: (value: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{value} - {record.name}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs!">{record.manager ?? 'Chưa phân công quản lý'}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Trạng thái ca',
    dataIndex: 'shiftStatus',
    render: (value: BranchStatus['shiftStatus']) =>
      value === 'open' ? <Tag color="green">● Đang mở</Tag> : <Tag color="gold">○ Chưa mở ca</Tag>,
  },
  { title: 'Tồn VND', dataIndex: 'vndBalance', align: 'right', render: (value: number) => formatVnd(value) },
  { title: 'Tồn USD', dataIndex: 'usdBalance', align: 'right', render: (value: number) => formatUsd(value) },
  { title: 'GD', dataIndex: 'todayTransactions', align: 'right' },
  { title: 'Giá trị GD', dataIndex: 'revenueToday', align: 'right', render: (value: number) => formatVnd(value) },
  {
    title: 'LN tạm tính',
    dataIndex: 'profitToday',
    align: 'right',
    render: (value: number) => <Typography.Text className="text-emerald-600!">{formatVnd(value)}</Typography.Text>,
  },
  {
    title: 'Chênh lệch',
    dataIndex: 'discrepancyValueVnd',
    render: (value: number, record) => {
      const colorMap = { matched: 'green', warning: 'gold', danger: 'red', none: 'default' } as const;
      return <Tag color={colorMap[record.discrepancy]}>{record.discrepancy === 'matched' ? 'Khớp' : formatVnd(value)}</Tag>;
    },
  },
  {
    title: 'Rủi ro',
    dataIndex: 'riskLevel',
    render: (value: BranchStatus['riskLevel']) => {
      const meta = {
        normal: { label: 'Ổn định', color: 'green' },
        watch: { label: 'Theo dõi', color: 'gold' },
        risk: { label: 'Rủi ro', color: 'red' },
      }[value];
      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
  },
];

const MAX_VISIBLE_RATES = 6;
const mixColors = ['#f5b301', '#2563eb', '#16a34a', '#f59e0b'];
const sourceLabels = { WU: 'WU', MG: 'MG', FX: 'Ngoại tệ', DOMESTIC: 'Chuyển tiền' };

const rateColumns: ColumnsType<CompanyExchangeRate> = [
  { title: 'Tỷ giá', dataIndex: 'label', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'Quốc gia', dataIndex: 'country' },
  {
    title: 'Giá trị',
    dataIndex: 'value',
    align: 'right',
    render: (value: string) => <Typography.Text className="font-mono text-base! font-semibold!">{value}</Typography.Text>,
  },
  { title: 'Hiệu lực', dataIndex: 'effectiveFrom', align: 'right', render: (value: string) => formatDateTime(value) },
  { title: 'Trạng thái', key: 'status', align: 'center', render: () => <Tag color="green">ACTIVE</Tag> },
];

const operationColumns: ColumnsType<OperationSummaryRow> = [
  {
    title: 'Nghiệp vụ',
    dataIndex: 'operation',
    fixed: 'left',
    width: 170,
    render: (value: string, record) => (
      <Space>
        <Tag color={record.key === 'WU' ? 'gold' : record.key === 'MG' ? 'blue' : 'green'}>{record.key}</Tag>
        <Typography.Text strong>{value}</Typography.Text>
      </Space>
    ),
  },
  { title: 'Số giao dịch', dataIndex: 'transactionCount', align: 'right', width: 110 },
  {
    title: 'Giá trị USD',
    dataIndex: 'totalUsd',
    align: 'right',
    width: 150,
    render: (value: number | null) => value === null ? '—' : formatUsd(value),
  },
  {
    title: 'Giá trị VND',
    dataIndex: 'totalVnd',
    align: 'right',
    width: 180,
    render: (value: number) => formatVnd(value),
  },
  {
    title: 'Kết quả',
    dataIndex: 'resultValue',
    align: 'right',
    width: 190,
    render: (value: number | null, record) => value === null ? (
      <Typography.Text type="secondary">{record.resultLabel}</Typography.Text>
    ) : (
      <Space direction="vertical" size={0} align="end">
        <Typography.Text className="text-emerald-700!" strong>{formatVnd(value)}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs!">{record.resultLabel}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Công nợ USD',
    dataIndex: 'debtUsd',
    align: 'right',
    width: 160,
    render: (value: number | null) => value === null
      ? '—'
      : <Typography.Text className={value > 0 ? 'text-amber-700!' : ''}>{formatUsd(value)}</Typography.Text>,
  },
];

const fundAColumns: ColumnsType<SummaryDto['fundA'][number]> = [
  { title: 'Ngoại tệ', dataIndex: 'currency', render: (value: string) => <Tag>{value}</Tag> },
  { title: 'Tồn quỹ', dataIndex: 'balance', align: 'right', render: (value: number, record) => `${value.toLocaleString('en-US')} ${record.currency}` },
];

function rateLabel(rate: CompanyDashboardDto['activeRates'][number]) {
  const primaryLabels: Record<string, string> = {
    PAID_BUY: 'Paid mua WU/MG',
    PAID_SELL: 'Paid bán WU/MG',
    BANK_RATE: 'Tỷ giá ngân hàng',
  };
  return primaryLabels[rate.rateType] ?? `${rate.fromCurrency} ${rate.rateType === 'FX_BUY' ? 'mua' : rate.rateType === 'FX_SELL' ? 'bán' : rate.rateType}`;
}

function sparkline(values: number[]) {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 8);
  return values.map((value) => Math.max(8, Math.round((value / max) * 100)));
}

export function CompanyDashboardPage() {
  const navigate = useNavigate();
  const dashboardDate = dayjs().format('YYYY-MM-DD');
  const { data: dashboard, isLoading: isDashboardLoading } = useCompanyDashboard(dashboardDate);
  const { data: summary, isLoading: isSummaryLoading } = useSummary();
  const operations = dashboard?.operations;
  const overview = dashboard?.overview;
  const branchRows = dashboard?.branches ?? [];
  const revenueTrend = (dashboard?.revenueTrend ?? []).map((item) => ({
    ...item,
    revenue: item.revenueVnd / 1_000_000_000,
    profit: item.profitVnd / 1_000_000,
  }));
  const transactionMix = (dashboard?.transactionMix ?? []).map((item) => ({
    name: sourceLabels[item.source],
    value: item.count,
  }));
  const activeRates: CompanyExchangeRate[] = (dashboard?.activeRates ?? []).map((rate) => ({
    id: rate.id,
    label: rateLabel(rate),
    country: getCurrencyMetadata(rate.fromCurrency).country,
    value: formatExchangeRate(rate.rate, 6),
    effectiveFrom: rate.effectiveFrom,
  }));
  const visibleRates = activeRates.slice(0, MAX_VISIBLE_RATES);
  const hiddenRateCount = Math.max(0, activeRates.length - visibleRates.length);
  const changePercent = overview?.changePercent;
  const changeValue = overview?.changeValueVnd;
  const usdConversionRate = dashboard?.activeRates.find((rate) => (
    rate.fromCurrency === 'USD'
    && rate.toCurrency === 'VND'
    && rate.rateType === 'PAID_BUY'
  ))?.rate ?? dashboard?.activeRates.find((rate) => (
    rate.fromCurrency === 'USD'
    && rate.toCurrency === 'VND'
    && rate.rateType === 'FX_BUY'
  ))?.rate ?? 0;
  const totalCapitalUsd = usdConversionRate > 0
    ? (overview?.totalCapitalVnd ?? 0) / usdConversionRate
    : null;
  const summaryTransactions = summary?.transactions;
  const operationRows: OperationSummaryRow[] = [
    {
      key: 'WU',
      operation: 'Western Union',
      transactionCount: summaryTransactions?.wu.count ?? 0,
      totalUsd: summaryTransactions?.wu.totalUsd ?? 0,
      totalVnd: summaryTransactions?.wu.totalVnd ?? 0,
      resultValue: summaryTransactions?.wu.profit ?? 0,
      resultLabel: 'Lợi nhuận tạm tính',
      debtUsd: summary?.debt.wuOutstandingUsd ?? 0,
    },
    {
      key: 'MG',
      operation: 'MoneyGram',
      transactionCount: summaryTransactions?.mg.count ?? 0,
      totalUsd: summaryTransactions?.mg.totalUsd ?? 0,
      totalVnd: summaryTransactions?.mg.totalVnd ?? 0,
      resultValue: summaryTransactions?.mg.profit ?? 0,
      resultLabel: 'Lợi nhuận tạm tính',
      debtUsd: summary?.debt.mgOutstandingUsd ?? 0,
    },
    {
      key: 'FX',
      operation: 'Mua/Bán ngoại tệ',
      transactionCount: (summaryTransactions?.fx.buyCount ?? 0) + (summaryTransactions?.fx.sellCount ?? 0),
      totalUsd: null,
      totalVnd: (summaryTransactions?.fx.buyVnd ?? 0) + (summaryTransactions?.fx.sellVnd ?? 0),
      resultValue: null,
      resultLabel: `${summaryTransactions?.fx.buyCount ?? 0} mua · ${summaryTransactions?.fx.sellCount ?? 0} bán`,
      debtUsd: null,
    },
  ];
  const operationKpis = [
    {
      label: 'Giao dịch',
      value: String(operations?.transactionCount ?? 0),
      detail: `WU: ${operations?.sourceCounts.wu ?? 0} · MG: ${operations?.sourceCounts.mg ?? 0} · NT: ${operations?.sourceCounts.fx ?? 0} · CT: ${operations?.sourceCounts.domestic ?? 0}`,
      icon: <ThunderboltOutlined />,
      tone: 'blue' as const,
    },
    {
      label: 'Giá trị giao dịch',
      value: formatVnd(operations?.transactionValueVnd ?? 0),
      detail: 'Tổng giao dịch hoàn tất hôm nay',
      icon: <DollarOutlined />,
      tone: 'green' as const,
    },
    {
      label: 'Sai lệch chờ xử lý',
      value: String(operations?.pendingVarianceCount ?? 0),
      detail: `${operations?.majorVarianceCount ?? 0} lớn · ${operations?.minorVarianceCount ?? 0} nhỏ`,
      icon: <AlertOutlined />,
      tone: 'amber' as const,
    },
    {
      label: 'Chi nhánh đang mở',
      value: `${operations?.openBranchCount ?? 0} / ${operations?.totalBranchCount ?? 0}`,
      detail: operations?.closedBranches.length
        ? `${operations.closedBranches.slice(0, 2).join(', ')}${operations.closedBranches.length > 2 ? ` +${operations.closedBranches.length - 2}` : ''} chưa mở`
        : 'Tất cả chi nhánh đang mở',
      icon: <BuildOutlined />,
      tone: 'teal' as const,
    },
  ];

  return (
    <Space direction="vertical" size={16} className="w-full">
      <BalanceOverviewCard
        loading={isDashboardLoading}
        eyebrow="Tổng vốn công ty"
        amount={formatExchangeRate(overview?.totalCapitalVnd ?? 0, 0)}
        secondaryAmount={totalCapitalUsd === null ? 'Chưa có tỷ giá USD' : formatUsd(totalCapitalUsd)}
        secondaryAmountLabel="Quy đổi USD"
        compactPrimaryAmount
        emphasizeSubBalances
        statusTag={{
          label: changePercent === null || changePercent === undefined ? 'Hiện tại' : `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
          color: changePercent === null || changePercent === undefined ? 'default' : changePercent >= 0 ? 'green' : 'red',
        }}
        caption={changeValue === null || changeValue === undefined ? 'Chưa có số liệu ngày trước' : `${changeValue >= 0 ? '+' : ''}${formatVnd(changeValue)} so ngày trước`}
        sparklineBars={sparkline(overview?.capitalTrend.map((item) => item.valueVnd) ?? Array(7).fill(0))}
        subBalances={[
          { label: 'VND tiền mặt', value: formatVnd(overview?.cashVnd ?? 0) },
          { label: 'USD tiền mặt', value: formatUsd(overview?.cashUsd ?? 0) },
          { label: 'Ngân hàng quy đổi', value: formatVnd(overview?.bankValueVnd ?? 0) },
          { label: 'Công nợ quy đổi', value: formatVnd(overview?.debtValueVnd ?? 0) },
        ]}
        actions={[
          { label: 'Công nợ', icon: <FileSearchOutlined />, primary: true, onClick: () => navigate('/debt-management') },
          { label: 'Quỹ chung', icon: <MoneyCollectOutlined />, onClick: () => navigate('/fund-management/central-fund') },
          { label: 'Ngân hàng', icon: <BankOutlined />, onClick: () => navigate('/bank-management/accounts') },
          { label: 'Tỷ giá', icon: <CheckCircleOutlined />, onClick: () => navigate('/exchange-rate') },
        ]}
      />

      <KpiGrid items={operationKpis} loading={isDashboardLoading} />

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={17} className="flex">
          <Card
            loading={isSummaryLoading}
            title="Bảng tổng hợp nghiệp vụ hôm nay"
            extra={<Typography.Text type="secondary">Tự cập nhật mỗi 15 giây</Typography.Text>}
            className="w-full"
          >
            <Table<OperationSummaryRow>
              columns={operationColumns}
              dataSource={operationRows}
              rowKey="key"
              pagination={false}
              scroll={{ x: 960 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={7} className="flex">
          <Card
            loading={isSummaryLoading}
            title="Cảnh báo vận hành"
            extra={<Tag color={(summary?.alerts.length ?? 0) > 0 ? 'gold' : 'green'}>{summary?.alerts.length ?? 0}</Tag>}
            className="w-full"
          >
            {(summary?.alerts.length ?? 0) === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có cảnh báo" />
            ) : (
              <Space direction="vertical" size={10} className="w-full">
                {summary?.alerts.map((alert, index) => (
                  <Alert
                    key={`${alert.type}-${index}`}
                    type={alert.level === 'error' ? 'error' : 'warning'}
                    showIcon
                    message={alert.message}
                  />
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card loading={isDashboardLoading} title="Giá trị giao dịch và lợi nhuận 7 ngày" extra={<Typography.Text type="secondary">Đơn vị: tỷ ₫ / triệu ₫</Typography.Text>}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueTrend} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Giá trị giao dịch (tỷ ₫)" fill="#f5b301" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="profit" name="LN WU/MG (triệu ₫)" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card loading={isDashboardLoading} title="Cơ cấu giao dịch hôm nay">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={transactionMix} dataKey="value" nameKey="name" innerRadius={64} outerRadius={104} paddingAngle={3} label>
                    {transactionMix.map((entry, index) => <Cell key={entry.name} fill={mixColors[index % mixColors.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8} className="flex">
          <Card
            loading={isSummaryLoading}
            title="Tồn Quỹ A"
            extra={<Tag>{summary?.fundA.length ?? 0} ngoại tệ</Tag>}
            className="w-full"
          >
            <Table
              columns={fundAColumns}
              dataSource={summary?.fundA ?? []}
              rowKey="currency"
              pagination={false}
              locale={{ emptyText: 'Chưa có tồn Quỹ A' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={16} className="flex">
          <Card
            loading={isDashboardLoading}
            title="Danh sách tỷ giá đang áp dụng"
            extra={<Typography.Text type="secondary">Tối đa {MAX_VISIBLE_RATES} tỷ giá</Typography.Text>}
            className="w-full"
          >
            <Space direction="vertical" size={12} className="w-full">
              <div className="flex items-center justify-between gap-3">
                <Space>
                  <Tag color="green">● ACTIVE</Tag>
                  <Typography.Text type="secondary">Cập nhật {dashboard?.ratesUpdatedAt ? formatDateTime(dashboard.ratesUpdatedAt) : 'chưa có dữ liệu'}</Typography.Text>
                </Space>
                {hiddenRateCount > 0 && <Tag>+{hiddenRateCount} tỷ giá khác</Tag>}
              </div>
              <Table columns={rateColumns} dataSource={visibleRates} rowKey="id" pagination={false} size="middle" />
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        loading={isDashboardLoading}
        title="Danh sách quản lý chi nhánh"
        extra={<Typography.Text type="secondary">{branchRows.length} chi nhánh · {dayjs(dashboard?.businessDate).format('DD/MM/YYYY')}</Typography.Text>}
      >
        <Table columns={branchColumns} dataSource={branchRows} rowKey="id" pagination={false} size="middle" scroll={{ x: 1280 }} />
      </Card>
    </Space>
  );
}
