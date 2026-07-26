import {
  BankOutlined,
  BarChartOutlined,
  FieldTimeOutlined,
  LineChartOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Segmented, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import {
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
import { PageScaffold } from '@/shared/components/PageScaffold';
import { activePaidRatesMock } from '@/modules/exchange-rate/data/exchangeRates.mock';
import { branchFundsMock } from '@/modules/fund-management/data/funds.mock';
import { aggregatedTransactionsMock } from '@/modules/transactions/data/transactions.mock';
import type { TransactionSource } from '@/modules/transactions/model/transaction.types';
import { formatExchangeRate, formatForeignCurrency, formatUsd, formatVnd } from '@/shared/utils/formatters';
import type { BranchFund, FundACurrencyBalance } from '@/modules/fund-management/model/fund.types';

type PeriodKey = 'day' | 'month' | 'year';

type BranchMonitoringRow = {
  key: string;
  branchName: string;
  manager: string;
  currentFundValue: number;
  vndCash: number;
  usdCash: number;
  transactionCount: number;
  completedCount: number;
  transactionValue: number;
  openShiftLabel: string;
  status: BranchFund['status'];
};

const periodOptions = [
  { label: 'Ngày', value: 'day' },
  { label: 'Tháng', value: 'month' },
  { label: 'Năm', value: 'year' },
];

const branchOptions = [
  ...branchFundsMock.map((branch) => ({ label: branch.branchName, value: branch.key })),
];

const statusMeta: Record<BranchFund['status'], { label: string; color: string }> = {
  NORMAL: { label: 'Ổn định', color: 'green' },
  LOW_CASH: { label: 'Thiếu quỹ', color: 'gold' },
  NEEDS_RECONCILIATION: { label: 'Cần kiểm quỹ', color: 'red' },
};

const sourceColors: Record<TransactionSource, string> = {
  WU: '#111827',
  MG: '#f5b301',
  FX: '#64748b',
  DOMESTIC: '#a16207',
};

const sourceLabels: Record<TransactionSource, string> = {
  WU: 'Western Union',
  MG: 'MoneyGram',
  FX: 'Ngoại tệ',
  DOMESTIC: 'Chuyển tiền',
};

function getFundAValue(branch: BranchFund) {
  return branch.fundA.reduce((sum, item) => sum + item.vndValue, 0);
}

function getCurrentFundValue(branch: BranchFund) {
  return branch.vndCash + branch.usdCash * activePaidRatesMock.paidBuy + getFundAValue(branch);
}

function getPeriodMultiplier(period: PeriodKey) {
  if (period === 'month') return 18;
  if (period === 'year') return 240;
  return 1;
}

function getBranchBaseTransactions(branch: BranchFund) {
  const branchCode = branch.openShift?.code.split('-')[0] ?? branch.key.toUpperCase();
  const branchRatio = getCurrentFundValue(branch) / getCurrentFundValue(branchFundsMock[0]);

  return aggregatedTransactionsMock.map((transaction, index) => ({
    ...transaction,
    key: `${branch.key}-${transaction.key}`,
    branch: branchCode,
    shiftCode: branch.openShift?.code ?? `${branchCode}-20260626-00`,
    vndAmount: Math.round(transaction.vndAmount * branchRatio * (0.82 + index * 0.045)),
  }));
}

function buildBranchRows(period: PeriodKey): BranchMonitoringRow[] {
  const multiplier = getPeriodMultiplier(period);

  return branchFundsMock.map((branch) => {
    const transactions = getBranchBaseTransactions(branch);
    const periodTransactions = transactions.map((transaction) => ({
      ...transaction,
      vndAmount: Math.round(transaction.vndAmount * multiplier),
    }));

    return {
      key: branch.key,
      branchName: branch.branchName,
      manager: branch.manager,
      currentFundValue: getCurrentFundValue(branch),
      vndCash: branch.vndCash,
      usdCash: branch.usdCash,
      transactionCount: periodTransactions.length * multiplier,
      completedCount: periodTransactions.filter((transaction) => transaction.status === 'COMPLETED').length * multiplier,
      transactionValue: periodTransactions.reduce((sum, transaction) => sum + transaction.vndAmount, 0),
      openShiftLabel: branch.openShift ? `${branch.openShift.cashier} · ${branch.openShift.code}` : 'Không có ca mở',
      status: branch.status,
    };
  });
}

function buildSourceMix(period: PeriodKey, branchKey: string) {
  const multiplier = getPeriodMultiplier(period);
  const sourceTotals = new Map<TransactionSource, number>();
  const branches = branchFundsMock.filter((branch) => branch.key === branchKey);

  branches.forEach((branch) => {
    getBranchBaseTransactions(branch).forEach((transaction) => {
      sourceTotals.set(transaction.source, (sourceTotals.get(transaction.source) ?? 0) + Math.round(transaction.vndAmount * multiplier));
    });
  });

  return Array.from(sourceTotals.entries()).map(([source, value]) => ({
    source,
    label: sourceLabels[source],
    value,
  }));
}

function buildTrend(period: PeriodKey, rows: BranchMonitoringRow[]) {
  const labels = period === 'day'
    ? ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']
    : period === 'month'
      ? ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4']
      : ['Q1', 'Q2', 'Q3', 'Q4'];
  const total = rows.reduce((sum, row) => sum + row.transactionValue, 0);

  return labels.map((label, index) => {
    const weight = 0.12 + index * 0.035;
    return {
      label,
      value: Math.round(total * weight),
      fund: Math.round(rows.reduce((sum, row) => sum + row.currentFundValue, 0) * (0.92 + index * 0.018)),
    };
  });
}

export function BranchMonitoringPage() {
  const [period, setPeriod] = useState<PeriodKey>('day');
  const [branchKey, setBranchKey] = useState(branchFundsMock[0]?.key ?? '');

  const rows = useMemo(() => {
    const allRows = buildBranchRows(period);
    return allRows.filter((row) => row.key === branchKey);
  }, [branchKey, period]);
  const sourceMix = useMemo(() => buildSourceMix(period, branchKey), [branchKey, period]);
  const trend = useMemo(() => buildTrend(period, rows), [period, rows]);

  const totalCurrentFund = rows.reduce((sum, row) => sum + row.currentFundValue, 0);
  const totalTransactionValue = rows.reduce((sum, row) => sum + row.transactionValue, 0);
  const totalTransactionCount = rows.reduce((sum, row) => sum + row.transactionCount, 0);
  const activeShiftCount = rows.filter((row) => row.openShiftLabel !== 'Không có ca mở').length;
  const shiftStatusLabel = activeShiftCount > 0 ? 'Đang mở' : 'Đã đóng';
  const selectedBranch = branchFundsMock.find((branch) => branch.key === branchKey) ?? branchFundsMock[0];
  const fundATotalValue = selectedBranch.fundA.reduce((sum, item) => sum + item.vndValue, 0);

  const fundAColumns: ColumnsType<FundACurrencyBalance> = [
    {
      title: 'Ngoại tệ',
      dataIndex: 'currency',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">{record.name}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Số lượng', dataIndex: 'amount', align: 'right', render: (value: number, record) => formatForeignCurrency(value, record.currency) },
    { title: 'Tỷ giá mua', dataIndex: 'buyRate', align: 'right', render: (value: number) => formatExchangeRate(value) },
    { title: 'Giá trị quy đổi', dataIndex: 'vndValue', align: 'right', render: (value: number) => formatVnd(value) },
  ];

  return (
    <PageScaffold
      title="Chi Nhánh"
      description="Giám đốc/KTTH theo dõi quỹ hiện tại và giao dịch theo ngày, tháng, năm của từng chi nhánh."
      moduleName="branch-management"
      extra={(
        <Space wrap>
          <Segmented value={period} options={periodOptions} onChange={(value) => setPeriod(value as PeriodKey)} />
          <Select className="min-w-64" value={branchKey} options={branchOptions} onChange={setBranchKey} />
        </Space>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="branch-monitor-hero polished-card" classNames={{ body: 'p-0!' }}>
          <div className="grid xl:grid-cols-[1.2fr_1.8fr]">
            <div className="border-b border-white/10 p-6 xl:border-r xl:border-b-0">
              <Typography.Text className="text-white/65! text-xs! font-semibold! uppercase">Tổng quỹ hiện tại</Typography.Text>
              <Typography.Title level={2} className="mt-2! mb-2! text-white!">{formatVnd(totalCurrentFund)}</Typography.Title>
              <Typography.Text className="text-white/70!">
                Quy đổi USD theo Paid mua {formatExchangeRate(activePaidRatesMock.paidBuy)}.
              </Typography.Text>
            </div>
            <Row gutter={[12, 12]} className="p-6">
              <Col xs={24} md={8}>
                <Statistic title="Trạng thái ca" value={shiftStatusLabel} prefix={<FieldTimeOutlined />} />
                <Typography.Text className="text-white/60! text-xs!">
                  {rows[0]?.openShiftLabel}
                </Typography.Text>
              </Col>
              <Col xs={24} md={8}>
                <Statistic title="Số giao dịch" value={totalTransactionCount} prefix={<BarChartOutlined />} />
                <Typography.Text className="text-white/60! text-xs!">Theo kỳ lọc</Typography.Text>
              </Col>
              <Col xs={24} md={8}>
                <Statistic title="Giá trị giao dịch" value={totalTransactionValue} formatter={(value) => formatVnd(Number(value))} prefix={<BankOutlined />} />
                <Typography.Text className="text-white/60! text-xs!">Theo kỳ lọc</Typography.Text>
              </Col>
            </Row>
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={15}>
            <Card title={<Space><LineChartOutlined />Xu hướng giao dịch và quỹ</Space>} className="polished-card">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1_000_000)}M`} />
                    <Tooltip formatter={(value: number) => formatVnd(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="value" name="Giá trị giao dịch" stroke="#f5b301" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="fund" name="Quỹ hiện tại" stroke="#111827" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
          <Col xs={24} xl={9}>
            <Card title={<Space><SwapOutlined />Cơ cấu giao dịch</Space>} className="polished-card">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceMix} dataKey="value" nameKey="label" innerRadius={64} outerRadius={108} paddingAngle={3}>
                      {sourceMix.map((entry) => (
                        <Cell key={entry.source} fill={sourceColors[entry.source]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatVnd(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        </Row>

        <Card
          title="Chi tiết chi nhánh"
          extra={<Tag color={statusMeta[selectedBranch.status].color}>{statusMeta[selectedBranch.status].label}</Tag>}
          className="polished-card"
        >
          <Space direction="vertical" size={16} className="w-full">
            <div>
              <Typography.Title level={4} className="mb-1!">{selectedBranch.branchName}</Typography.Title>
              <Typography.Text type="secondary">
                Quản lý: {selectedBranch.manager} · Kiểm quỹ gần nhất: {selectedBranch.lastCashCountAt}
              </Typography.Text>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card className="border-brand-100! bg-brand-50!" classNames={{ body: 'p-4!' }}>
                  <Statistic title="VND tiền mặt" value={selectedBranch.vndCash} formatter={(value) => formatVnd(Number(value))} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card className="border-slate-200!" classNames={{ body: 'p-4!' }}>
                  <Statistic title="USD tiền mặt" value={selectedBranch.usdCash} formatter={(value) => formatUsd(Number(value))} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card className="border-slate-200!" classNames={{ body: 'p-4!' }}>
                  <Statistic title="Quỹ A quy đổi" value={fundATotalValue} formatter={(value) => formatVnd(Number(value))} />
                </Card>
              </Col>
            </Row>

            <Table
              columns={fundAColumns}
              dataSource={selectedBranch.fundA}
              rowKey="currency"
              pagination={false}
            />
          </Space>
        </Card>
      </Space>
    </PageScaffold>
  );
}
