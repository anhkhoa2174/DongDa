import {
  AuditOutlined,
  BankOutlined,
  CalculatorOutlined,
  InboxOutlined,
  MoneyCollectOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { FundBalanceTable } from '@/shared/components/FundBalanceTable';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import { SectionCardTitle } from '@/shared/components/SectionCardTitle';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { formatCurrency, formatDateTime, formatExchangeRate, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { useBranches as useFundBranches, useFundBalances } from '@/modules/fund-transfer/hooks/useFundTransfers';
import { useCurrentShift } from '@/modules/shift-management/hooks/useShift';
import type { FundACurrencyBalance } from '../model/fund.types';
import type { FundMovementHistoryDto } from '../api/centralFund.api';
import { useCentralFundSummary, useFundMovementHistory } from '../hooks/useCentralFund';

function FundActionBar({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="fund-actions">
      <div>
        <Typography.Text strong>Thao tác quỹ</Typography.Text>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      <Space wrap size={8}>{children}</Space>
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

const movementKind: Record<FundMovementHistoryDto['kind'], { label: string; color: string }> = {
  RECEIPT: { label: 'Phiếu thu', color: 'green' },
  EXPENSE: { label: 'Phiếu chi', color: 'red' },
  TRANSFER_IN: { label: 'Tiếp quỹ vào', color: 'blue' },
  TRANSFER_OUT: { label: 'Tiếp quỹ ra', color: 'gold' },
};

function FundMovementHistoryTable({
  items,
  loading,
  branchNames,
}: {
  items: FundMovementHistoryDto[];
  loading: boolean;
  branchNames: Record<string, string>;
}) {
  const columns: ColumnsType<FundMovementHistoryDto> = [
    {
      title: 'Mã phiếu',
      dataIndex: 'documentNo',
      render: (value) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: 'Loại biến động',
      dataIndex: 'kind',
      render: (value: FundMovementHistoryDto['kind']) => (
        <Tag color={movementKind[value].color}>{movementKind[value].label}</Tag>
      ),
    },
    {
      title: 'Nguồn',
      dataIndex: 'sourceType',
      render: (value) => value === 'CASH' ? 'Tiền mặt' : value === 'BANK' ? 'Ngân hàng' : 'Điều chuyển',
    },
    {
      title: 'Đối tác',
      dataIndex: 'counterpartyBranchId',
      render: (value?: string | null) => value ? (branchNames[value] ?? value) : '-',
    },
    { title: 'Ngoại tệ', dataIndex: 'currencyCode', width: 90 },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      align: 'right',
      render: (value, row) => formatCurrency(Number(value), row.currencyCode, row.currencyCode === 'VND' ? 0 : 2),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Thời gian',
      dataIndex: 'occurredAt',
      render: formatDateTime,
    },
  ];

  return (
    <Card
      className="polished-card"
      title={<SectionCardTitle icon={<SwapOutlined />}>Lịch sử biến động quỹ</SectionCardTitle>}
      extra={<Typography.Text type="secondary">{items.length} dòng biến động</Typography.Text>}
    >
      <Table
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 1040 }}
        size="small"
        locale={{ emptyText: 'Chưa có phiếu thu, chi hoặc tiếp quỹ' }}
      />
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
  const { data: movementHistory = [], isLoading: isLoadingHistory, refetch: refetchHistory } = useFundMovementHistory(branchId);
  const branch = branches.find((item) => item.id === branchId);
  const branchNames = Object.fromEntries(branches.map((item) => [item.id, `${item.code} - ${item.name}`]));
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
    await Promise.all([refetch(), refetchShift(), refetchHistory()]);
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
        <OperationalOverviewCard
          loading={isLoading}
          eyebrow="Quỹ tiền mặt chi nhánh"
          title={branch?.name ?? user?.branchName ?? 'Chi nhánh đang làm việc'}
          icon={<WalletOutlined />}
          meta={<Typography.Text className="operational-code">{branch?.code ?? branchId}</Typography.Text>}
          aside={(
            <Tag className="branch-fund-overview__status" color={shift ? 'green' : 'gold'} icon={<SafetyCertificateOutlined />}>
              {shift ? `CA ${shift.shiftCode} ĐANG MỞ` : 'KHÔNG CÓ CA MỞ'}
            </Tag>
          )}
          metrics={[
            {
              label: 'Quỹ gốc',
              value: formatVnd(vndCash),
              note: `${formatUsd(usdCash)} · VND và USD tiền mặt`,
            },
            {
              label: 'Quỹ A',
              value: `${fundABalances.length} loại ngoại tệ`,
              note: 'Ngoại tệ khác USD theo tồn ledger',
            },
          ]}
        />

        <FundActionBar description="Ghi nhận biến động và đối chiếu tiền mặt tại chi nhánh">
          <Button className="fund-action--primary" icon={<InboxOutlined />} onClick={() => navigate('/fund-transfer')}>Tiếp Quỹ</Button>
          <Button className="fund-action--secondary" icon={<CalculatorOutlined />} onClick={() => navigate('/cash-count/branch')}>Kiểm Quỹ</Button>
          <Button icon={<PlusCircleOutlined />} onClick={() => navigate('/fund-management/branch-funds/receipts')}>Tạo Phiếu Thu</Button>
          <Button icon={<MinusCircleOutlined />} onClick={() => navigate('/fund-management/branch-funds/expenses')}>Tạo Phiếu Chi</Button>
        </FundActionBar>

        <Card
          className="branch-fund-table-card"
          title={<SectionCardTitle icon={<MoneyCollectOutlined />}>Chi tiết tồn quỹ</SectionCardTitle>}
          extra={<Space><Tag color="green">LEDGER</Tag><Typography.Text type="secondary">{balances.length} tài khoản</Typography.Text></Space>}
          loading={isLoading}
        >
          <FundBalanceTable items={balanceRows} emptyText="Chi nhánh chưa có tài khoản quỹ" />
        </Card>
        <FundMovementHistoryTable items={movementHistory} loading={isLoadingHistory} branchNames={branchNames} />
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
  const { data: branches = [] } = useFundBranches();
  const headOffice = branches.find((item) => item.type === 'HEAD_OFFICE');
  const { data: movementHistory = [], isLoading: isLoadingHistory } = useFundMovementHistory(headOffice?.id);
  const branchNames = Object.fromEntries(branches.map((item) => [item.id, `${item.code} - ${item.name}`]));
  const fundA = summary?.fundA ?? [];
  const totalCompanyFundUsd = summary?.paidBuyRate
    ? (summary.totalCompanyFundVnd / summary.paidBuyRate)
    : null;
  const weeklyChange = summary?.weeklyCapitalChangeVnd ?? 0;
  const weeklyChangeLabel = weeklyChange > 0 ? 'Tăng' : weeklyChange < 0 ? 'Giảm' : 'Không đổi';

  return (
    <PageScaffold
      title="Quỹ Chung"
      description="Theo dõi nguồn vốn trung tâm, tiền mặt VND/USD, ngân hàng, Quỹ A và công nợ quy đổi."
      moduleName="fund-management"
      extra={(
        <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>Đồng bộ số dư</Button>
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
        <FundActionBar description="Điều chuyển vốn, kiểm quỹ và ghi nhận thu chi tại Hội sở">
          {canTransfer && (
            <Button className="fund-action--primary" icon={<InboxOutlined />} onClick={() => navigate('/fund-transfer')}>Tiếp Quỹ</Button>
          )}
          <Button className="fund-action--secondary" icon={<CalculatorOutlined />} onClick={() => navigate('/cash-count/central')}>Kiểm Quỹ Tổng</Button>
          {canCreateCashMovement && (
            <>
              <Button className="fund-action--conversion" icon={<SwapOutlined />} onClick={() => navigate('/fund-management/central-fund/convert-fund-a')}>Bán ngoại tệ Quỹ A</Button>
              <Button icon={<PlusCircleOutlined />} onClick={() => navigate('/fund-management/central-fund/receipts')}>Tạo Phiếu Thu</Button>
              <Button icon={<MinusCircleOutlined />} onClick={() => navigate('/fund-management/central-fund/expenses')}>Tạo Phiếu Chi</Button>
            </>
          )}
        </FundActionBar>
        <Card loading={isLoading} className="central-fund-overview overflow-hidden" classNames={{ body: 'p-0!' }}>
          <div className="central-fund-overview__header">
            <div className="min-w-0">
              <Typography.Text className="central-fund-overview__eyebrow">Tổng vốn kiểm soát</Typography.Text>
              <Typography.Title level={2} className="central-fund-overview__amount">{formatVnd(summary?.totalCompanyFundVnd ?? 0)}</Typography.Title>
              <Typography.Text className="central-fund-overview__amount-usd">
                {totalCompanyFundUsd === null ? 'Chưa có tỷ giá quy đổi USD' : formatUsd(totalCompanyFundUsd)}
              </Typography.Text>
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
              <div>
                <span>Biến động từ đầu tuần</span>
                <strong className={weeklyChange > 0 ? 'is-positive' : weeklyChange < 0 ? 'is-negative' : ''}>
                  {weeklyChangeLabel} {formatVnd(Math.abs(weeklyChange))}
                  {summary?.weeklyCapitalChangePercent === null || summary?.weeklyCapitalChangePercent === undefined
                    ? ''
                    : ` (${Math.abs(summary.weeklyCapitalChangePercent).toFixed(2)}%)`}
                </strong>
              </div>
            </div>
          </div>

          <div className="central-fund-kpis">
            {[
              {
                label: 'Tiền mặt Hội sở',
                usd: formatUsd(summary?.usdCash ?? 0),
                vnd: formatVnd(summary?.vndCash ?? 0),
                icon: <MoneyCollectOutlined />,
              },
              {
                label: 'Số dư ngân hàng',
                usd: formatUsd(summary?.bankUsd ?? 0),
                vnd: formatVnd(summary?.bankVnd ?? 0),
                icon: <BankOutlined />,
              },
              {
                label: 'Công nợ phải thu',
                usd: formatUsd(summary?.debtUsd ?? 0),
                vnd: formatVnd(summary?.debtVnd ?? 0),
                icon: <AuditOutlined />,
              },
              {
                label: 'Quỹ tại chi nhánh',
                usd: formatUsd(summary?.branchFundUsd ?? 0),
                vnd: formatVnd(summary?.branchFundVnd ?? 0),
                icon: <InboxOutlined />,
              },
            ].map((item) => (
              <div className="central-fund-kpi" key={item.label}>
                <span className="central-fund-kpi__icon">{item.icon}</span>
                <div className="min-w-0">
                  <div className="central-fund-kpi__label">{item.label}</div>
                  <div className="central-fund-kpi__values">
                    <strong>{item.usd}</strong>
                    <strong>{item.vnd}</strong>
                  </div>
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
              <FundBreakdownRow label="Tiền mặt USD" value={formatUsd(summary?.usdCash ?? 0)} />
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
        <FundMovementHistoryTable items={movementHistory} loading={isLoadingHistory} branchNames={branchNames} />
      </Space>

    </PageScaffold>
  );
}

export function BranchFundsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const isControlRole = role === 'director' || role === 'accountant' || role === 'auditor';

  return isControlRole ? <Navigate to="/branch-management/monitoring" replace /> : <BranchFundMainPage />;
}
