import {
  AlertOutlined,
  AuditOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  InboxOutlined,
  MoneyCollectOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Input, Progress, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { activePaidRatesMock } from '@/modules/exchange-rate/data/exchangeRates.mock';
import { formatExchangeRate, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { branchFundsMock, centralFundMock } from '../data/funds.mock';
import type { BranchFund, FundACurrencyBalance, FundStatus } from '../model/fund.types';

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
  const user = useAuthStore((state) => state.user);
  const branch = branchFundsMock.find((item) => item.key === user?.branchId) ?? branchFundsMock[0];

  return (
    <PageScaffold
      title="Quỹ Chi Nhánh"
      description="Theo dõi VND, USD, Quỹ A và ca đang mở của chi nhánh."
      moduleName="fund-management"
      extra={<Button icon={<ReloadOutlined />}>Làm mới quỹ</Button>}
    >
      <Space direction="vertical" size={16} className="w-full">
        <BranchFundCard branch={branch} />
      </Space>
    </PageScaffold>
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
  const totalBranchValue = branchFundsMock.reduce((sum, branch) => sum + getBranchVndValue(branch), 0);
  const totalFundAValue = centralFundMock.fundA.reduce((sum, item) => sum + item.vndValue, 0);
  const centralCashValue =
    centralFundMock.vndCash +
    centralFundMock.usdCash * activePaidRatesMock.paidBuy +
    totalFundAValue;
  const totalDebtValue = centralFundMock.debtVnd + centralFundMock.debtUsd * activePaidRatesMock.paidBuy;
  const totalCompanyCapital =
    centralCashValue +
    centralFundMock.bankBalance +
    totalBranchValue -
    totalDebtValue;

  return (
    <PageScaffold
      title="Quỹ Chung"
      description="Theo dõi nguồn vốn trung tâm, tiền mặt VND/USD, ngân hàng, Quỹ A và công nợ quy đổi."
      moduleName="fund-management"
      extra={(
        <Space wrap>
          <Button icon={<ReloadOutlined />}>Đồng bộ số dư</Button>
          <Button type="primary" icon={<InboxOutlined />}>Tạo tiếp quỹ</Button>
        </Space>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="fund-central-hero overflow-hidden text-white!" classNames={{ body: 'p-0!' }}>
          <div className="p-6">
            <div className="mb-6 flex items-start justify-between gap-4 max-lg:flex-col">
              <div>
                <Typography.Text className="text-white/75! uppercase tracking-normal!">Tổng vốn kiểm soát</Typography.Text>
                <Typography.Title level={2} className="mt-1! mb-2! text-white!">{formatVnd(totalCompanyCapital)}</Typography.Title>
                <Typography.Text className="text-white/75!">
                  Tiền mặt, ngân hàng, công nợ và tổng quỹ chi nhánh quy đổi theo Paid mua {formatExchangeRate(activePaidRatesMock.paidBuy)}.
                </Typography.Text>
              </div>
              <Tag color="gold" className="m-0!">Đối chiếu {centralFundMock.lastReconciledAt}</Tag>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12} xl={6}>
                <div className="fund-central-tile">
                  <Typography.Text className="text-white/70!">Tiền mặt</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatVnd(centralCashValue)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="fund-central-tile">
                  <Typography.Text className="text-white/70!">Ngân hàng</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatVnd(centralFundMock.bankBalance)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="fund-central-tile">
                  <Typography.Text className="text-white/70!">Công nợ</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatVnd(totalDebtValue)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="fund-central-tile">
                  <Typography.Text className="text-white/70!">Tổng quỹ chi nhánh</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatVnd(totalBranchValue)}</div>
                </div>
              </Col>
            </Row>
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={15}>
            <Card title={<Space><MoneyCollectOutlined />Quỹ Chung</Space>} className="polished-card">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Statistic title="Tiền mặt VND" value={centralFundMock.vndCash} formatter={(value) => formatVnd(Number(value))} />
                </Col>
                <Col xs={24} md={8}>
                  <Statistic title="Tiền mặt USD" value={centralFundMock.usdCash} formatter={(value) => formatUsd(Number(value))} />
                </Col>
                <Col xs={24} md={8}>
                  <Statistic title="Quỹ A quy đổi" value={totalFundAValue} formatter={(value) => formatVnd(Number(value))} />
                </Col>
              </Row>
            </Card>
          </Col>
          <Col xs={24} xl={9}>
            <Card title={<Space><BankOutlined />Cấu phần kiểm soát</Space>} className="polished-card">
              <Space direction="vertical" className="w-full">
                <div className="flex items-center justify-between"><Typography.Text>Tiền mặt quy đổi</Typography.Text><Typography.Text strong>{formatVnd(centralCashValue)}</Typography.Text></div>
                <div className="flex items-center justify-between"><Typography.Text>Số dư ngân hàng</Typography.Text><Typography.Text strong>{formatVnd(centralFundMock.bankBalance)}</Typography.Text></div>
                <div className="flex items-center justify-between"><Typography.Text>Công nợ quy đổi</Typography.Text><Typography.Text strong>{formatVnd(totalDebtValue)}</Typography.Text></div>
                <div className="flex items-center justify-between"><Typography.Text>Tổng quỹ chi nhánh</Typography.Text><Typography.Text strong>{formatVnd(totalBranchValue)}</Typography.Text></div>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card title="Quỹ A thuộc Quỹ Chung" className="polished-card">
          <FundAList items={centralFundMock.fundA} />
        </Card>
      </Space>
    </PageScaffold>
  );
}

export function BranchFundsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isControlRole = role === 'director' || role === 'accountant';

  return isControlRole ? <ControlBranchFundsPage /> : <BranchFundMainPage />;
}
