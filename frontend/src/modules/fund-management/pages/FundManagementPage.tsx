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
import { formatCurrency, formatNumber } from '@/shared/utils/formatters';
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
    { title: 'Tồn', dataIndex: 'amount', align: 'right', render: (value: number) => formatNumber(value) },
    { title: 'Paid mua', dataIndex: 'buyRate', align: 'right', render: (value: number) => formatNumber(value) },
    { title: 'Quy đổi', dataIndex: 'vndValue', align: 'right', render: (value: number) => formatCurrency(value) },
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
      className="h-full overflow-hidden"
      classNames={{ body: 'p-0!' }}
      title={(
        <div className="min-w-0">
          <Typography.Text strong className="block truncate text-base!">{branch.branchName}</Typography.Text>
          <Typography.Text type="secondary" className="block text-xs!">Quản lý: {branch.manager}</Typography.Text>
        </div>
      )}
      extra={<Tag color={status.color} icon={status.icon}>{status.label}</Tag>}
    >
      <div className="space-y-4 p-5">
        <div>
          <Typography.Text type="secondary" className="uppercase tracking-normal!">Tổng quy đổi theo Paid mua</Typography.Text>
          <Typography.Title level={2} className="m-0! text-3xl!">{formatCurrency(totalValue)}</Typography.Title>
        </div>

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <div className="rounded border border-slate-100 bg-slate-50 p-3">
              <Typography.Text type="secondary">VND tiền mặt</Typography.Text>
              <div className="mt-1 font-semibold">{formatCurrency(branch.vndCash)}</div>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="rounded border border-slate-100 bg-slate-50 p-3">
              <Typography.Text type="secondary">USD tiền mặt</Typography.Text>
              <div className="mt-1 font-semibold">{formatCurrency(branch.usdCash, 'USD')}</div>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="rounded border border-slate-100 bg-slate-50 p-3">
              <Typography.Text type="secondary">Quỹ A</Typography.Text>
              <div className="mt-1 font-semibold">{branch.fundA.length} ngoại tệ</div>
            </div>
          </Col>
        </Row>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <Typography.Text type="secondary">Tỷ trọng tiền ra hôm nay</Typography.Text>
            <Typography.Text strong>{outPercent}%</Typography.Text>
          </div>
          <Progress percent={outPercent} showInfo={false} strokeColor="#0f766e" />
        </div>

        <Row gutter={[12, 12]}>
          <Col span={12}>
            <div className="rounded border border-slate-100 p-3">
              <Typography.Text type="secondary">Tiền vào</Typography.Text>
              <div className="mt-1 font-semibold text-emerald-700">{formatCurrency(branch.todayIn)}</div>
            </div>
          </Col>
          <Col span={12}>
            <div className="rounded border border-slate-100 p-3">
              <Typography.Text type="secondary">Tiền ra</Typography.Text>
              <div className="mt-1 font-semibold text-rose-700">{formatCurrency(branch.todayOut)}</div>
            </div>
          </Col>
        </Row>

        <div className="space-y-2 border-t border-slate-100 pt-4">
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
            <Typography.Text strong>{formatCurrency(branch.pendingFundTransfer)}</Typography.Text>
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
        <Card>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic title="Tổng quỹ chi nhánh quy đổi" value={totalBranchValue} formatter={(value) => formatCurrency(Number(value))} />
            </Col>
            <Col xs={24} md={8}>
              <Statistic title="Chi nhánh thiếu quỹ" value={lowCashCount} suffix="CN" />
            </Col>
            <Col xs={24} md={8}>
              <Statistic title="Cần kiểm quỹ" value={needsReconciliationCount} suffix="CN" />
            </Col>
          </Row>
        </Card>

        <Card title="Bộ lọc chi nhánh">
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
  const totalCompanyCapital =
    centralFundMock.vndCash +
    centralFundMock.usdCash * activePaidRatesMock.paidBuy +
    centralFundMock.bankBalance +
    totalFundAValue +
    totalBranchValue -
    centralFundMock.debtVnd -
    centralFundMock.debtUsd * activePaidRatesMock.paidBuy;

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
        <Card className="overflow-hidden bg-teal-700! text-white!" classNames={{ body: 'p-0!' }}>
          <div className="p-6">
            <div className="mb-6 flex items-start justify-between gap-4 max-lg:flex-col">
              <div>
                <Typography.Text className="text-white/75! uppercase tracking-normal!">Tổng vốn kiểm soát</Typography.Text>
                <Typography.Title level={2} className="mt-1! mb-2! text-white!">{formatCurrency(totalCompanyCapital)}</Typography.Title>
                <Typography.Text className="text-white/75!">
                  Quy đổi USD và Quỹ A theo Paid mua {formatNumber(activePaidRatesMock.paidBuy)}
                </Typography.Text>
              </div>
              <Tag color="cyan" className="m-0!">Đối chiếu {centralFundMock.lastReconciledAt}</Tag>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Quỹ Chung VND</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatCurrency(centralFundMock.vndCash)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Quỹ Chung USD</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatCurrency(centralFundMock.usdCash, 'USD')}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Ngân hàng</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatCurrency(centralFundMock.bankBalance)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Tổng quỹ chi nhánh</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatCurrency(totalBranchValue)}</div>
                </div>
              </Col>
            </Row>
          </div>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={15}>
            <Card title={<Space><MoneyCollectOutlined />Quỹ Chung</Space>}>
              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Statistic title="Quỹ A quy đổi" value={totalFundAValue} formatter={(value) => formatCurrency(Number(value))} />
                </Col>
                <Col xs={24} md={8}>
                  <Statistic title="Công nợ VND" value={centralFundMock.debtVnd} formatter={(value) => formatCurrency(Number(value))} />
                </Col>
                <Col xs={24} md={8}>
                  <Statistic title="Công nợ USD" value={centralFundMock.debtUsd} formatter={(value) => formatCurrency(Number(value), 'USD')} />
                </Col>
              </Row>
            </Card>
          </Col>
          <Col xs={24} xl={9}>
            <Card title={<Space><BankOutlined />Cấu phần kiểm soát</Space>}>
              <Space direction="vertical" className="w-full">
                <div className="flex items-center justify-between"><Typography.Text>Tiền mặt VND</Typography.Text><Typography.Text strong>{formatCurrency(centralFundMock.vndCash)}</Typography.Text></div>
                <div className="flex items-center justify-between"><Typography.Text>Tiền mặt USD</Typography.Text><Typography.Text strong>{formatCurrency(centralFundMock.usdCash, 'USD')}</Typography.Text></div>
                <div className="flex items-center justify-between"><Typography.Text>Số dư ngân hàng</Typography.Text><Typography.Text strong>{formatCurrency(centralFundMock.bankBalance)}</Typography.Text></div>
                <div className="flex items-center justify-between"><Typography.Text>Quỹ A quy đổi</Typography.Text><Typography.Text strong>{formatCurrency(totalFundAValue)}</Typography.Text></div>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card title="Quỹ A thuộc Quỹ Chung">
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
