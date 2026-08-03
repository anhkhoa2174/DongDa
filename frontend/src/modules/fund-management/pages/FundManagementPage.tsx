import {
  AlertOutlined,
  AuditOutlined,
  BankOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  InboxOutlined,
  MoneyCollectOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Input, Progress, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { FundBalanceTable } from '@/shared/components/FundBalanceTable';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { activePaidRatesMock } from '@/modules/exchange-rate/data/exchangeRates.mock';
import { formatDateTime, formatExchangeRate, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { useBranches as useFundBranches, useFundBalances } from '@/modules/fund-transfer/hooks/useFundTransfers';
import { useCurrentShift } from '@/modules/shift-management/hooks/useShift';
import { branchFundsMock } from '../data/funds.mock';
import type { BranchFund, FundACurrencyBalance, FundStatus } from '../model/fund.types';
import { useCentralFundSummary } from '../hooks/useCentralFund';

const statusMeta: Record<FundStatus, { label: string; color: string; icon: JSX.Element }> = {
  NORMAL: { label: 'Ổn định', color: 'green', icon: <CheckCircleOutlined /> },
  LOW_CASH: { label: 'Thiếu quỹ', color: 'gold', icon: <AlertOutlined /> },
  NEEDS_RECONCILIATION: { label: 'Cần kiểm quỹ', color: 'red', icon: <ClockCircleOutlined /> },
};

const branchOptions = [
  { value: 'ALL', label: 'Tất cả chi nhánh' },
  ...branchFundsMock.map((branch) => ({ value: branch.key, label: branch.branchName })),
];

function getFundAValue(fundA: FundACurrencyBalance[]) {
  return fundA.reduce((sum, item) => sum + item.vndValue, 0);
}

function getBranchVndValue(branch: BranchFund) {
  return branch.vndCash + branch.usdCash * activePaidRatesMock.paidBuy + getFundAValue(branch.fundA);
}

function FundMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'in' | 'out' | 'warning';
}) {
  const toneClass = {
    default: 'text-slate-950',
    in: 'text-emerald-700',
    out: 'text-rose-700',
    warning: 'text-amber-700',
  }[tone];

  return (
    <div className="fund-metric">
      <Typography.Text type="secondary" className="text-xs! font-semibold! uppercase">{label}</Typography.Text>
      <div className={`mt-1 truncate text-base font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function FundBreakdownRow({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className={`central-fund-row ${strong ? 'central-fund-row--total' : ''}`}>
      <div className="min-w-0">
        <Typography.Text strong={strong}>{label}</Typography.Text>
        {note && <Typography.Text type="secondary" className="mt-0.5 block text-xs!">{note}</Typography.Text>}
      </div>
      <Typography.Text strong className="central-fund-row__value">{value}</Typography.Text>
    </div>
  );
}

function FundAList({ items }: { items: FundACurrencyBalance[] }) {
  const columns: ColumnsType<FundACurrencyBalance> = [
    {
      title: 'Ngoại tệ',
      dataIndex: 'currency',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{record.name}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Tồn', dataIndex: 'amount', align: 'right', render: (value: number) => formatExchangeRate(value) },
    { title: 'Paid mua', dataIndex: 'buyRate', align: 'right', render: (value: number) => formatExchangeRate(value) },
    { title: 'Quy đổi', dataIndex: 'vndValue', align: 'right', render: (value: number) => formatVnd(value) },
  ];

  return <Table columns={columns} dataSource={items} rowKey="currency" pagination={false} size="small" />;
}

function BranchFundCard({ branch, compact = false }: { branch: BranchFund; compact?: boolean }) {
  const status = statusMeta[branch.status];
  const totalValue = getBranchVndValue(branch);
  const movementTotal = branch.todayIn + branch.todayOut;
  const outPercent = movementTotal === 0 ? 0 : Math.round((branch.todayOut / movementTotal) * 100);

  return (
    <Card
      className="fund-branch-card h-full overflow-hidden"
      classNames={{ body: 'p-0!' }}
    >
      <div className="fund-branch-card__header">
        <div className="min-w-0">
          <Typography.Text className="text-white/65! text-xs! font-semibold! uppercase">Chi nhánh</Typography.Text>
          <Typography.Title level={4} className="m-0! truncate text-white!">{branch.branchName}</Typography.Title>
          <Typography.Text className="text-white/70! text-xs!">Quản lý: {branch.manager}</Typography.Text>
        </div>
        <Tag color={status.color} icon={status.icon} className="m-0!">{status.label}</Tag>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div>
            <Typography.Text type="secondary" className="text-xs! font-semibold! uppercase">Tổng quy đổi theo Paid mua</Typography.Text>
            <Typography.Title level={2} className="mt-1! mb-0! text-3xl!">{formatVnd(totalValue)}</Typography.Title>
          </div>
          <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-right">
            <Typography.Text type="secondary" className="block text-xs!">Paid mua</Typography.Text>
            <Typography.Text strong>{formatExchangeRate(activePaidRatesMock.paidBuy)}</Typography.Text>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FundMetric label="VND tiền mặt" value={formatVnd(branch.vndCash)} />
          <FundMetric label="USD tiền mặt" value={formatUsd(branch.usdCash)} />
          <FundMetric label="Quỹ A" value={`${branch.fundA.length} ngoại tệ`} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <Typography.Text type="secondary">Tỷ trọng tiền ra hôm nay</Typography.Text>
            <Typography.Text strong>{outPercent}%</Typography.Text>
          </div>
          <Progress percent={outPercent} showInfo={false} strokeColor="#f5b301" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FundMetric label="Tiền vào hôm nay" value={formatVnd(branch.todayIn)} tone="in" />
          <FundMetric label="Tiền ra hôm nay" value={formatVnd(branch.todayOut)} tone="out" />
        </div>

        <div className="fund-detail-list border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">Ca đang mở</Typography.Text>
            {branch.openShift ? <Tag color="green">{branch.openShift.cashier}</Tag> : <Tag>Không có ca</Tag>}
          </div>
          {branch.openShift && (
            <Typography.Text type="secondary" className="block">
              {branch.openShift.code} · mở lúc {branch.openShift.openedAt}
            </Typography.Text>
          )}
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">Chờ tiếp quỹ</Typography.Text>
            <Typography.Text strong>{formatVnd(branch.pendingFundTransfer)}</Typography.Text>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">Kiểm quỹ cuối</Typography.Text>
            <Typography.Text>{branch.lastCashCountAt}</Typography.Text>
          </div>
        </div>

        {!compact && <FundAList items={branch.fundA} />}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-4">
        <Button icon={<EyeOutlined />}>Chi tiết</Button>
        <Button icon={<InboxOutlined />}>Tiếp quỹ</Button>
        <Button icon={<AuditOutlined />}>Kiểm quỹ</Button>
        <Button icon={<SwapOutlined />}>Lịch sử</Button>
      </div>
    </Card>
  );
}

function BranchFundMainPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const branchId = user?.branchId;
  const { data: balances = [], isLoading, isFetching, isError, refetch } = useFundBalances(branchId);
  const { data: currentShift, isFetching: isFetchingShift, refetch: refetchShift } = useCurrentShift(branchId);
  const { data: branches = [] } = useFundBranches();
  const branch = branches.find((item) => item.id === branchId);
  const shift = currentShift?.shift;
  const cashBalances = balances.filter((item) => item.accountType === 'CASH');
  const fundABalances = balances.filter((item) => item.accountType === 'FUND_A');
  const vndCash = cashBalances
    .filter((item) => item.currencyCode === 'VND')
    .reduce((sum, item) => sum + item.balance, 0);
  const usdCash = cashBalances
    .filter((item) => item.currencyCode === 'USD')
    .reduce((sum, item) => sum + item.balance, 0);
  const refresh = async () => {
    await Promise.all([refetch(), refetchShift()]);
  };
  const balanceRows = balances.map((item) => ({
    key: item.id,
    currencyCode: item.currencyCode,
    accountType: item.accountType,
    accountName: item.name,
    accountCode: item.code,
    balance: item.balance,
  }));

  return (
    <PageScaffold
      title="Quỹ Chi Nhánh"
      description="Theo dõi số dư ledger và ghi nhận phiếu thu, chi của chi nhánh đang làm việc."
      moduleName="fund-management"
      extra={(
        <Button icon={<ReloadOutlined />} loading={isFetching || isFetchingShift} onClick={() => void refresh()}>
          Đồng bộ số dư
        </Button>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        {isError && <Alert type="error" showIcon message="Không thể tải số dư Quỹ Chi Nhánh" />}
        <Card className="branch-fund-overview" classNames={{ body: 'p-0!' }} loading={isLoading}>
          <div className="branch-fund-overview__header">
            <div className="branch-fund-overview__identity">
              <span className="branch-fund-overview__icon"><WalletOutlined /></span>
              <div className="min-w-0">
                <Typography.Text className="branch-fund-overview__eyebrow">Quỹ tiền mặt chi nhánh</Typography.Text>
                <Typography.Title level={2} className="branch-fund-overview__name">
                  {branch?.name ?? user?.branchName ?? 'Chi nhánh đang làm việc'}
                </Typography.Title>
                <Typography.Text className="branch-fund-overview__code">{branch?.code ?? branchId}</Typography.Text>
              </div>
            </div>
            <Tag className="branch-fund-overview__status" color={shift ? 'green' : 'gold'} icon={<SafetyCertificateOutlined />}>
              {shift ? `CA ${shift.shiftCode} ĐANG MỞ` : 'KHÔNG CÓ CA MỞ'}
            </Tag>
          </div>

          <div className="branch-fund-overview__metrics">
            <BranchFundOverviewMetric label="Tiền mặt VND" value={formatVnd(vndCash)} note={`${cashBalances.filter((item) => item.currencyCode === 'VND').length} tài khoản`} />
            <BranchFundOverviewMetric label="Tiền mặt USD" value={formatUsd(usdCash)} note={`${cashBalances.filter((item) => item.currencyCode === 'USD').length} tài khoản`} />
            <BranchFundOverviewMetric label="Quỹ A" value={`${fundABalances.length} ngoại tệ`} note="Tồn thực tế theo từng loại tiền" />
            <BranchFundOverviewMetric label="Tổng sổ quỹ" value={`${balances.length} tài khoản`} note="Dữ liệu ledger đã ghi sổ" />
          </div>
        </Card>

        <div className="branch-fund-actions">
          <div>
            <Typography.Text strong>Thao tác quỹ</Typography.Text>
            <Typography.Text type="secondary">Ghi nhận biến động và đối chiếu tiền mặt tại chi nhánh</Typography.Text>
          </div>
          <Space wrap size={8}>
            <Button className="branch-fund-action branch-fund-action--in" icon={<PlusCircleOutlined />} onClick={() => navigate('/fund-management/branch-funds/receipts')}>Tạo Phiếu Thu</Button>
            <Button className="branch-fund-action branch-fund-action--out" icon={<MinusCircleOutlined />} onClick={() => navigate('/fund-management/branch-funds/expenses')}>Tạo Phiếu Chi</Button>
            <Button icon={<CalculatorOutlined />} onClick={() => navigate('/cash-count/branch')}>Kiểm Quỹ</Button>
            <Button icon={<InboxOutlined />} onClick={() => navigate('/fund-transfer')}>Tiếp Quỹ</Button>
          </Space>
        </div>

        <Card
          className="branch-fund-table-card"
          title={<span className="shift-card-title"><MoneyCollectOutlined /> Chi tiết tồn quỹ</span>}
          extra={<Space><Tag color="green">LEDGER</Tag><Typography.Text type="secondary">{balances.length} tài khoản</Typography.Text></Space>}
          loading={isLoading}
        >
          <FundBalanceTable items={balanceRows} emptyText="Chi nhánh chưa có tài khoản quỹ" />
        </Card>
      </Space>
    </PageScaffold>
  );
}

function BranchFundOverviewMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="branch-fund-overview__metric">
      <Typography.Text>{label}</Typography.Text>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}

function ControlBranchFundsPage() {
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | FundStatus>('ALL');
  const [keyword, setKeyword] = useState('');

  const filteredBranches = useMemo(
    () =>
      branchFundsMock.filter((branch) => {
        const matchesBranch = branchFilter === 'ALL' || branch.key === branchFilter;
        const matchesStatus = statusFilter === 'ALL' || branch.status === statusFilter;
        const text = `${branch.branchName} ${branch.manager} ${branch.openShift?.cashier ?? ''}`.toLowerCase();
        const matchesKeyword = text.includes(keyword.toLowerCase());
        return matchesBranch && matchesStatus && matchesKeyword;
      }),
    [branchFilter, keyword, statusFilter],
  );

  const totalBranchValue = branchFundsMock.reduce((sum, branch) => sum + getBranchVndValue(branch), 0);
  const lowCashCount = branchFundsMock.filter((branch) => branch.status === 'LOW_CASH').length;
  const needsReconciliationCount = branchFundsMock.filter((branch) => branch.status === 'NEEDS_RECONCILIATION').length;
  const selectedBranch = branchFilter === 'ALL' ? null : branchFundsMock.find((branch) => branch.key === branchFilter);

  return (
    <PageScaffold
      title="Quỹ Chi Nhánh"
      description="GĐ/KTTH theo dõi tồn quỹ từng chi nhánh, ca đang mở, trạng thái kiểm quỹ và nhu cầu tiếp quỹ."
      moduleName="fund-management"
      extra={<Button icon={<ReloadOutlined />}>Đồng bộ quỹ chi nhánh</Button>}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="fund-command-center polished-card" classNames={{ body: 'p-0!' }}>
          <div className="grid xl:grid-cols-[1.3fr_1fr]">
            <div className="border-b border-slate-200 p-6 xl:border-r xl:border-b-0">
              <Typography.Text className="text-xs! font-semibold! uppercase text-white/65!">Tổng quan quỹ chi nhánh</Typography.Text>
              <Typography.Title level={2} className="mt-2! mb-2! text-white!">{formatVnd(totalBranchValue)}</Typography.Title>
              <Typography.Text className="text-white/70!">
                Bao gồm VND, USD quy đổi theo Paid mua và toàn bộ Quỹ A tại chi nhánh.
              </Typography.Text>
            </div>
            <div className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-1">
              <div className="fund-command-metric">
                <Typography.Text className="text-white/65! text-xs! font-semibold! uppercase">Chi nhánh thiếu quỹ</Typography.Text>
                <div className="mt-1 text-3xl font-bold text-brand-700">{lowCashCount}<span className="ml-1 text-base text-white/60">CN</span></div>
              </div>
              <div className="fund-command-metric">
                <Typography.Text className="text-white/65! text-xs! font-semibold! uppercase">Cần kiểm quỹ</Typography.Text>
                <div className="mt-1 text-3xl font-bold text-white">{needsReconciliationCount}<span className="ml-1 text-base text-white/60">CN</span></div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Danh sách quỹ chi nhánh" className="polished-card">
          <Row gutter={[12, 12]} align="middle" className="mb-4">
            <Col xs={24} lg={9}>
              <Input.Search allowClear placeholder="Tìm chi nhánh, quản lý, giao dịch viên..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select className="w-full" value={branchFilter} onChange={setBranchFilter} options={branchOptions} />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select
                className="w-full"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
                ]}
              />
            </Col>
            <Col xs={24} lg={5}>
              <Button className="w-full" icon={<FilterOutlined />}>Bộ lọc nâng cao</Button>
            </Col>
          </Row>

          {selectedBranch ? (
            <BranchFundCard branch={selectedBranch} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <Typography.Text type="secondary">Đang hiển thị {filteredBranches.length} chi nhánh</Typography.Text>
                <Tag color="blue">Chọn một chi nhánh để mở page chi tiết</Tag>
              </div>
              <Row gutter={[16, 16]}>
                {filteredBranches.map((branch) => (
                  <Col xs={24} xl={12} key={branch.key}>
                    <BranchFundCard branch={branch} compact />
                  </Col>
                ))}
              </Row>
            </>
          )}
        </Card>
      </Space>
    </PageScaffold>
  );
}

export function CentralFundPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const canTransfer = role === 'director' || role === 'accountant';
  const canCreateCashMovement = role === 'director' || role === 'accountant';
  const { data: summary, isLoading, isError, isFetching, refetch } = useCentralFundSummary();
  const fundA = summary?.fundA ?? [];

  return (
    <PageScaffold
      title="Quỹ Chung"
      description="Theo dõi nguồn vốn trung tâm, tiền mặt VND/USD, ngân hàng, Quỹ A và công nợ quy đổi."
      moduleName="fund-management"
      extra={(
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>Đồng bộ số dư</Button>
          {canCreateCashMovement && (
            <>
              <Button icon={<MoneyCollectOutlined />} onClick={() => navigate('/fund-management/central-fund/receipts')}>Tạo Phiếu Thu</Button>
              <Button type="primary" icon={<MoneyCollectOutlined />} onClick={() => navigate('/fund-management/central-fund/expenses')}>Tạo Phiếu Chi</Button>
            </>
          )}
          <Button icon={<CalculatorOutlined />} onClick={() => navigate('/cash-count/central')}>Kiểm Quỹ Tổng</Button>
          {canTransfer && (
            <Button type="primary" icon={<InboxOutlined />} onClick={() => navigate('/fund-transfer')}>Tiếp Quỹ</Button>
          )}
        </Space>
      )}
    >
      <Space direction="vertical" size={20} className="w-full">
        {isError && (
          <Alert
            type="error"
            showIcon
            message="Không thể tải dữ liệu Quỹ Chung"
            action={<Button size="small" onClick={() => void refetch()}>Thử lại</Button>}
          />
        )}
        {summary?.missingRateCurrencies.length ? (
          <Alert
            type="warning"
            showIcon
            message={`Chưa có tỷ giá ACTIVE cho: ${summary.missingRateCurrencies.join(', ')}`}
            description="Giá trị quy đổi của các loại tiền này đang được tính bằng 0."
          />
        ) : null}
        <Card loading={isLoading} className="central-fund-overview overflow-hidden" classNames={{ body: 'p-0!' }}>
          <div className="central-fund-overview__header">
            <div className="min-w-0">
              <Typography.Text className="central-fund-overview__eyebrow">Tổng vốn kiểm soát</Typography.Text>
              <Typography.Title level={2} className="central-fund-overview__amount">{formatVnd(summary?.totalCompanyFundVnd ?? 0)}</Typography.Title>
              <Typography.Text className="central-fund-overview__caption">
                Tiền mặt, ngân hàng và công nợ phải thu trên toàn hệ thống.
              </Typography.Text>
            </div>
            <div className="central-fund-overview__meta">
              <div>
                <span>Paid mua</span>
                <strong>{formatExchangeRate(summary?.paidBuyRate ?? 0)}</strong>
              </div>
              <div>
                <span>Đối chiếu gần nhất</span>
                <strong>{summary?.lastReconciledAt ? formatDateTime(summary.lastReconciledAt) : 'Chưa đối chiếu'}</strong>
              </div>
            </div>
          </div>

          <div className="central-fund-kpis">
            {[
              { label: 'Tiền mặt quy đổi', value: formatVnd(summary?.centralCashValueVnd ?? 0), icon: <MoneyCollectOutlined /> },
              { label: 'Số dư ngân hàng', value: formatVnd(summary?.bankValueVnd ?? 0), icon: <BankOutlined /> },
              { label: 'Công nợ phải thu', value: formatVnd(summary?.debtValueVnd ?? 0), icon: <AuditOutlined /> },
              { label: 'Quỹ tại chi nhánh', value: formatVnd(summary?.branchFundValueVnd ?? 0), icon: <InboxOutlined /> },
            ].map((item) => (
              <div className="central-fund-kpi" key={item.label}>
                <span className="central-fund-kpi__icon">{item.icon}</span>
                <div className="min-w-0">
                  <div className="central-fund-kpi__label">{item.label}</div>
                  <div className="central-fund-kpi__value">{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Row gutter={[20, 20]} align="stretch">
          <Col xs={24} xl={12} className="flex">
            <Card
              title={<Space><MoneyCollectOutlined />Cấu phần tiền mặt</Space>}
              extra={<Tag color="gold">Quỹ Chung</Tag>}
              className="central-fund-detail w-full"
            >
              <FundBreakdownRow label="Tiền mặt VND" value={formatVnd(summary?.vndCash ?? 0)} />
              <FundBreakdownRow
                label="Tiền mặt USD quy đổi"
                value={formatVnd(summary?.usdCashValueVnd ?? 0)}
                note={`${formatUsd(summary?.usdCash ?? 0)} × ${formatExchangeRate(summary?.paidBuyRate ?? 0)}`}
              />
              <FundBreakdownRow
                label="Quỹ A quy đổi"
                value={formatVnd(summary?.fundAValueVnd ?? 0)}
                note={`${fundA.length} loại ngoại tệ`}
              />
              <FundBreakdownRow label="Tổng tiền mặt quy đổi" value={formatVnd(summary?.centralCashValueVnd ?? 0)} strong />
            </Card>
          </Col>
          <Col xs={24} xl={12} className="flex">
            <Card
              title={<Space><BankOutlined />Ngân hàng và công nợ</Space>}
              extra={<Button type="link" onClick={() => navigate('/bank-management/accounts')}>Xem tài khoản</Button>}
              className="central-fund-detail w-full"
            >
              <FundBreakdownRow label="Số dư ngân hàng" value={formatVnd(summary?.bankValueVnd ?? 0)} />
              <FundBreakdownRow label="Công nợ VND" value={formatVnd(summary?.debtVnd ?? 0)} />
              <FundBreakdownRow
                label="Công nợ USD quy đổi"
                value={formatVnd((summary?.debtUsd ?? 0) * (summary?.paidBuyRate ?? 0))}
                note={`${formatUsd(summary?.debtUsd ?? 0)} × ${formatExchangeRate(summary?.paidBuyRate ?? 0)}`}
              />
              <FundBreakdownRow label="Tổng công nợ quy đổi" value={formatVnd(summary?.debtValueVnd ?? 0)} strong />
            </Card>
          </Col>
        </Row>

        <Card
          title="Chi tiết Quỹ A"
          extra={<Tag>{fundA.length} ngoại tệ</Tag>}
          className="polished-card"
          loading={isLoading}
        >
          <FundAList items={fundA} />
        </Card>
      </Space>

    </PageScaffold>
  );
}

export function BranchFundsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isControlRole = role === 'director' || role === 'accountant' || role === 'auditor';

  return isControlRole ? <Navigate to="/branch-management/monitoring" replace /> : <BranchFundMainPage />;
}
