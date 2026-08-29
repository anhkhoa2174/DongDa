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
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, formatDateTime, formatExchangeRate, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { getCurrencyMetadata } from '@/shared/constants/currencies';
import type { CompanyDashboardDto, SummaryDto } from '@/modules/reports/api/summary.api';
import { useCompanyDashboard, useSummary } from '@/modules/reports/hooks/useSummary';
import { BalanceOverviewCard } from '../components/BalanceOverviewCard';
import { KpiGrid } from '../components/KpiGrid';

type BranchStatus = CompanyDashboardDto['branches'][number];
type ActiveCompanyRate = CompanyDashboardDto['activeRates'][number];
type RateCategory = 'PAID' | 'FX' | 'BANK';
type CompanyExchangeRate = {
  key: string;
  category: RateCategory;
  fromCurrency: string;
  country: string;
  buy?: ActiveCompanyRate;
  sell?: ActiveCompanyRate;
  bank?: ActiveCompanyRate;
  effectiveFrom: string;
};
type OperationSummaryRow = {
  key: 'WU' | 'MG' | 'FX';
  operation: string;
  transactionCount: number;
  transactionValueVnd: number;
  debtGeneratedUsd: number;
  debtGeneratedVnd: number;
};

const branchColumns: ColumnsType<BranchStatus> = [
  {
    title: 'Chi nhánh',
    dataIndex: 'code',
    width: 230,
    render: (value: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{value} - {record.name}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs!">{record.manager ?? 'Chưa phân công quản lý'}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Ca / rủi ro',
    key: 'operationStatus',
    width: 150,
    render: (_, record) => {
      const risk = {
        normal: { label: 'Ổn định', color: 'green' },
        watch: { label: 'Theo dõi', color: 'gold' },
        risk: { label: 'Rủi ro', color: 'red' },
      }[record.riskLevel];
      return (
        <Space direction="vertical" size={2}>
          {record.shiftStatus === 'open' ? <Tag color="green">Đang mở ca</Tag> : <Tag>Chưa mở ca</Tag>}
          <Tag color={risk.color}>{risk.label}</Tag>
        </Space>
      );
    },
  },
  {
    title: 'Tồn quỹ',
    key: 'balances',
    align: 'right',
    width: 190,
    render: (_, record) => (
      <Space direction="vertical" size={0} align="end">
        <Typography.Text strong>{formatVnd(record.vndBalance)}</Typography.Text>
        <Typography.Text type="secondary">{formatUsd(record.usdBalance)}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Giao dịch hôm nay',
    key: 'transactions',
    align: 'right',
    width: 190,
    render: (_, record) => (
      <Space direction="vertical" size={0} align="end">
        <Typography.Text strong>{record.todayTransactions} giao dịch</Typography.Text>
        <Typography.Text type="secondary">{formatVnd(record.transactionValueTodayVnd)}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Chênh lệch',
    dataIndex: 'discrepancyValueVnd',
    render: (value: number, record) => {
      const colorMap = { matched: 'green', warning: 'gold', danger: 'red', none: 'default' } as const;
      return <Tag color={colorMap[record.discrepancy]}>{record.discrepancy === 'matched' ? 'Khớp' : formatVnd(value)}</Tag>;
    },
  },
];

const MAX_VISIBLE_RATES = 6;
const mixColors = ['#f5b301', '#2563eb', '#16a34a', '#f59e0b'];
const sourceLabels = { WU: 'WU', MG: 'MG', FX: 'Ngoại tệ', DOMESTIC: 'Chuyển tiền' };

const rateColumns: ColumnsType<CompanyExchangeRate> = [
  {
    title: 'Loại tỷ giá',
    dataIndex: 'category',
    render: (value: RateCategory) => <Typography.Text strong>{rateCategoryLabel(value)}</Typography.Text>,
  },
  {
    title: 'Ngoại tệ',
    dataIndex: 'fromCurrency',
    render: (value: string) => (
      <Space direction="vertical" size={0}>
        <Typography.Text className="exchange-rate-code">{value}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs!">{getCurrencyMetadata(value).name}</Typography.Text>
      </Space>
    ),
  },
  { title: 'Quốc gia', dataIndex: 'country' },
  {
    title: 'Giá mua',
    key: 'buyRate',
    align: 'right',
    render: (_, row) => renderDashboardRate(row, 'buy'),
  },
  {
    title: 'Giá bán',
    key: 'sellRate',
    align: 'right',
    render: (_, row) => renderDashboardRate(row, 'sell'),
  },
  { title: 'Biên độ', key: 'margin', align: 'right', render: (_, row) => formatExchangeRate(rateMargin(row), 6) },
  { title: 'Hiệu lực', dataIndex: 'effectiveFrom', align: 'right', render: (value: string) => formatDateTime(value) },
];

const operationColumns: ColumnsType<OperationSummaryRow> = [
  {
    title: 'Nghiệp vụ',
    dataIndex: 'operation',
    width: 220,
    render: (value: string, record) => (
      <Space>
        <Tag color={record.key === 'WU' ? 'gold' : record.key === 'MG' ? 'blue' : 'green'}>{record.key}</Tag>
        <Typography.Text strong>{value}</Typography.Text>
      </Space>
    ),
  },
  { title: 'Số giao dịch', dataIndex: 'transactionCount', align: 'right', width: 120 },
  {
    title: 'Giá trị giao dịch',
    dataIndex: 'transactionValueVnd',
    align: 'right',
    width: 190,
    render: (value: number) => <Typography.Text strong>{formatVnd(value)}</Typography.Text>,
  },
  {
    title: 'Công nợ phát sinh',
    key: 'debtGenerated',
    align: 'right',
    width: 190,
    render: (_, record) => record.debtGeneratedUsd || record.debtGeneratedVnd ? (
      <Space direction="vertical" size={0} align="end">
        {record.debtGeneratedUsd > 0 && <Typography.Text strong>{formatUsd(record.debtGeneratedUsd)}</Typography.Text>}
        {record.debtGeneratedVnd > 0 && <Typography.Text strong>{formatVnd(record.debtGeneratedVnd)}</Typography.Text>}
      </Space>
    ) : <Typography.Text type="secondary">Không phát sinh</Typography.Text>,
  },
];

const systemFundColumns: ColumnsType<SummaryDto['fundA'][number]> = [
  {
    title: 'Loại tiền',
    dataIndex: 'currency',
    render: (value: string) => (
      <Space direction="vertical" size={0}>
        <Typography.Text className="exchange-rate-code">{value}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs!">{getCurrencyMetadata(value).name}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Số dư',
    dataIndex: 'balance',
    align: 'right',
    render: (value: number, record) => <Typography.Text strong>{formatCurrency(value, record.currency)}</Typography.Text>,
  },
];

function rateCategoryLabel(category: RateCategory) {
  return category === 'PAID' ? 'Tỷ giá Paid' : category === 'FX' ? 'Tỷ giá mua/bán' : 'Tỷ giá Ngân hàng';
}

function pairDashboardRates(rates: ActiveCompanyRate[]): CompanyExchangeRate[] {
  const rows = new Map<string, CompanyExchangeRate>();
  rates.forEach((rate) => {
    const category = rate.rateType === 'PAID_BUY' || rate.rateType === 'PAID_SELL'
      ? 'PAID'
      : rate.rateType === 'FX_BUY' || rate.rateType === 'FX_SELL'
        ? 'FX'
        : rate.rateType === 'BANK_RATE'
          ? 'BANK'
          : null;
    if (!category) return;
    const key = `${category}:${rate.fromCurrency}`;
    const current = rows.get(key) ?? {
      key,
      category,
      fromCurrency: rate.fromCurrency,
      country: getCurrencyMetadata(rate.fromCurrency).country,
      effectiveFrom: rate.effectiveFrom,
    };
    if (rate.rateType === 'PAID_BUY' || rate.rateType === 'FX_BUY') current.buy = rate;
    else if (rate.rateType === 'PAID_SELL' || rate.rateType === 'FX_SELL') current.sell = rate;
    else current.bank = rate;
    if (Date.parse(rate.effectiveFrom) > Date.parse(current.effectiveFrom)) current.effectiveFrom = rate.effectiveFrom;
    rows.set(key, current);
  });
  const order: Record<RateCategory, number> = { PAID: 0, FX: 1, BANK: 2 };
  return [...rows.values()].sort((first, second) => (
    order[first.category] - order[second.category]
    || first.fromCurrency.localeCompare(second.fromCurrency)
  ));
}

function renderDashboardRate(row: CompanyExchangeRate, side: 'buy' | 'sell') {
  const rate = row.category === 'BANK' ? row.bank : side === 'buy' ? row.buy : row.sell;
  const value = row.category === 'BANK'
    ? side === 'buy' ? rate?.buyRate ?? rate?.rate : rate?.sellRate
    : rate?.rate;
  return value === null || value === undefined
    ? <Typography.Text type="secondary">—</Typography.Text>
    : <Typography.Text className="font-mono text-base! font-semibold!">{formatExchangeRate(value, 6)}</Typography.Text>;
}

function rateMargin(row: CompanyExchangeRate) {
  return row.buy?.margin ?? row.sell?.margin ?? row.bank?.margin ?? 0;
}

function sparkline(values: number[]) {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 8);
  const min = Math.min(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 48);
  return values.map((value) => Math.round(18 + ((value - min) / range) * 82));
}

export function CompanyDashboardPage() {
  const navigate = useNavigate();
  const dashboardDate = dayjs().format('YYYY-MM-DD');
  const { data: dashboard, isLoading: isDashboardLoading } = useCompanyDashboard(dashboardDate);
  const { data: summary, isLoading: isSummaryLoading } = useSummary();
  const operations = dashboard?.operations;
  const overview = dashboard?.overview;
  const branchRows = dashboard?.branches ?? [];
  const capitalTrend = (overview?.capitalTrend ?? []).map((item) => ({
    ...item,
    label: dayjs(item.date).format('DD/MM'),
  }));
  const capitalValues = capitalTrend.map((item) => item.valueVnd);
  const capitalMin = capitalValues.length ? Math.min(...capitalValues) : 0;
  const capitalMax = capitalValues.length ? Math.max(...capitalValues) : 0;
  const capitalPadding = Math.max((capitalMax - capitalMin) * 0.25, 1_000_000);
  const capitalDomain: [number, number] = [
    Math.max(0, capitalMin - capitalPadding),
    capitalMax + capitalPadding,
  ];
  const transactionMix = (dashboard?.transactionMix ?? []).map((item) => ({
    name: sourceLabels[item.source],
    value: item.count,
  }));
  const activeRates = pairDashboardRates(dashboard?.activeRates ?? []);
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
  const baseFundBalances = [
    { currency: 'VND', balance: summary?.cash.vnd ?? 0 },
    { currency: 'USD', balance: summary?.cash.usd ?? 0 },
  ];
  const fundAByCurrency = (summary?.fundA ?? []).reduce<Map<string, number>>((balances, item) => {
    const currency = item.currency.toUpperCase();
    if (currency === 'VND' || currency === 'USD') return balances;
    balances.set(currency, (balances.get(currency) ?? 0) + Number(item.balance));
    return balances;
  }, new Map());
  const systemFundA = [...fundAByCurrency.entries()]
    .map(([currency, balance]) => ({ currency, balance }))
    .filter((item) => Math.abs(item.balance) > 0.000001)
    .sort((first, second) => Math.abs(second.balance) - Math.abs(first.balance)
      || first.currency.localeCompare(second.currency));
  const summaryTransactions = summary?.transactions;
  const operationRows: OperationSummaryRow[] = [
    {
      key: 'WU',
      operation: 'Western Union',
      transactionCount: summaryTransactions?.wu.count ?? 0,
      transactionValueVnd: summaryTransactions?.wu.transactionValueVnd ?? 0,
      debtGeneratedUsd: summaryTransactions?.wu.debtGeneratedUsd ?? 0,
      debtGeneratedVnd: summaryTransactions?.wu.debtGeneratedVnd ?? 0,
    },
    {
      key: 'MG',
      operation: 'MoneyGram',
      transactionCount: summaryTransactions?.mg.count ?? 0,
      transactionValueVnd: summaryTransactions?.mg.transactionValueVnd ?? 0,
      debtGeneratedUsd: summaryTransactions?.mg.debtGeneratedUsd ?? 0,
      debtGeneratedVnd: summaryTransactions?.mg.debtGeneratedVnd ?? 0,
    },
    {
      key: 'FX',
      operation: 'Mua/Bán ngoại tệ',
      transactionCount: (summaryTransactions?.fx.buyCount ?? 0) + (summaryTransactions?.fx.sellCount ?? 0),
      transactionValueVnd: (summaryTransactions?.fx.buyVnd ?? 0) + (summaryTransactions?.fx.sellVnd ?? 0),
      debtGeneratedUsd: 0,
      debtGeneratedVnd: 0,
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
              scroll={{ x: 720 }}
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
          <Card
            loading={isDashboardLoading}
            title="Biến động vốn công ty 7 ngày"
            extra={<Typography.Text type="secondary">Quy đổi theo tỷ giá áp dụng từng ngày</Typography.Text>}
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={capitalTrend} margin={{ top: 16, right: 16, bottom: 0, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" />
                  <YAxis
                    width={94}
                    domain={capitalDomain}
                    allowDataOverflow
                    tickFormatter={(value: number) => `${formatExchangeRate(value / 1_000_000_000, 4)} tỷ`}
                  />
                  <Tooltip formatter={(value: number) => [formatVnd(value), 'Tổng vốn']} />
                  <Bar dataKey="valueVnd" name="Tổng vốn công ty" fill="#f5b301" radius={[5, 5, 0, 0]} maxBarSize={64} />
                </BarChart>
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
            title="Tồn quỹ toàn hệ thống"
            extra={<Tag>{systemFundA.length} ngoại tệ có tồn</Tag>}
            className="w-full"
          >
            <Space direction="vertical" size={16} className="w-full">
              <section className="w-full">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Typography.Text strong>Quỹ gốc</Typography.Text>
                  <Tag color="gold">VND · USD</Tag>
                </div>
                <Table
                  columns={systemFundColumns}
                  dataSource={baseFundBalances}
                  rowKey="currency"
                  pagination={false}
                  size="small"
                />
              </section>
              <section className="w-full border-t border-slate-200 pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Typography.Text strong>Quỹ A</Typography.Text>
                  <Tag>{systemFundA.length} loại tiền</Tag>
                </div>
                <Table
                  columns={systemFundColumns}
                  dataSource={systemFundA}
                  rowKey="currency"
                  pagination={false}
                  size="small"
                  locale={{ emptyText: 'Chưa có ngoại tệ tồn Quỹ A' }}
                />
              </section>
            </Space>
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
              <Table columns={rateColumns} dataSource={visibleRates} rowKey="key" pagination={false} size="small" scroll={{ x: 900 }} />
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        loading={isDashboardLoading}
        title="Danh sách quản lý chi nhánh"
        extra={<Typography.Text type="secondary">{branchRows.length} chi nhánh · {dayjs(dashboard?.businessDate).format('DD/MM/YYYY')}</Typography.Text>}
      >
        <Table columns={branchColumns} dataSource={branchRows} rowKey="id" pagination={false} size="middle" scroll={{ x: 850 }} />
      </Card>
    </Space>
  );
}
