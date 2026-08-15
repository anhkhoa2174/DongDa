import {
  AuditOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Input, Progress, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatNumber, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { useBankAccountsView } from '../hooks/useBankAccountsView';
import type { BankAccount, BankAccountStatus, BankReconciliationStatus } from '../model/bank.types';

const bankOptions = [
  { value: 'ALL', label: 'Tất cả ngân hàng' },
  { value: 'ACB', label: 'ACB' },
  { value: 'MSB', label: 'MSB' },
  { value: 'TCB', label: 'TCB' },
] as const;

const statusOptions = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'RECONCILING', label: 'Đang đối chiếu' },
  { value: 'LOCKED', label: 'Đã khóa' },
] as const;

const statusMeta: Record<BankAccountStatus, { label: string; color: string; icon: JSX.Element }> = {
  ACTIVE: { label: 'Hoạt động', color: 'green', icon: <CheckCircleOutlined /> },
  RECONCILING: { label: 'Đang đối chiếu', color: 'gold', icon: <ClockCircleOutlined /> },
  LOCKED: { label: 'Đã khóa', color: 'red', icon: <LockOutlined /> },
};

const reconciliationMeta: Record<BankReconciliationStatus, { label: string; color: string; icon: JSX.Element }> = {
  MATCHED: { label: 'Khớp sổ', color: 'green', icon: <CheckCircleOutlined /> },
  PENDING: { label: 'Chờ đối chiếu', color: 'gold', icon: <ClockCircleOutlined /> },
  MISMATCH: { label: 'Lệch sổ', color: 'red', icon: <ExclamationCircleOutlined /> },
};

function formatAccountMoney(account: BankAccount, value: number) {
  return account.currency === 'VND' ? formatVnd(value) : formatUsd(value);
}

function BankAccountCard({ account }: { account: BankAccount }) {
  const liquidityPercent = Math.round((account.availableBalance / account.balance) * 100);
  const status = statusMeta[account.status];
  const reconciliation = reconciliationMeta[account.reconciliationStatus];
  const navigate = useNavigate();
  const movementsPath = `/bank-management/accounts/${account.key}/movements`;

  return (
    <Card
      className="h-full cursor-pointer overflow-hidden transition hover:border-brand-700"
      classNames={{ body: 'p-0!' }}
      onClick={() => navigate(movementsPath)}
      title={(
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-brand-50 text-lg text-black">
            <BankOutlined />
          </div>
          <div className="min-w-0">
            <Typography.Text strong className="block truncate text-base!">{account.accountName}</Typography.Text>
            <Typography.Text type="secondary" className="block truncate text-xs!">{account.accountNumber}</Typography.Text>
          </div>
        </div>
      )}
      extra={<Tag color={status.color} icon={status.icon}>{status.label}</Tag>}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" className="uppercase tracking-normal!">Số dư hiện tại</Typography.Text>
            <Typography.Title level={2} className="m-0! text-3xl! leading-tight!">
              {formatAccountMoney(account, account.balance)}
            </Typography.Title>
          </Space>
          <Tag className="m-0!" color="cyan">{account.bankCode}</Tag>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded bg-slate-50 p-3">
          <Statistic
            title="Khả dụng"
            value={account.availableBalance}
            formatter={(value) => formatAccountMoney(account, Number(value))}
          />
          <Statistic title="GD hôm nay" value={account.transactionCountToday} suffix="GD" />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <Typography.Text type="secondary">Tỷ lệ khả dụng</Typography.Text>
            <Typography.Text strong>{liquidityPercent}%</Typography.Text>
          </div>
          <Progress percent={liquidityPercent} showInfo={false} strokeColor="#f5b301" />
        </div>

        <Row gutter={[12, 12]}>
          <Col span={12}>
            <div className="rounded border border-slate-100 p-3">
              <Typography.Text type="secondary">Tiền vào hôm nay</Typography.Text>
              <div className="mt-1 font-semibold text-emerald-700">{formatAccountMoney(account, account.todayIn)}</div>
            </div>
          </Col>
          <Col span={12}>
            <div className="rounded border border-slate-100 p-3">
              <Typography.Text type="secondary">Tiền ra hôm nay</Typography.Text>
              <div className="mt-1 font-semibold text-rose-700">{formatAccountMoney(account, account.todayOut)}</div>
            </div>
          </Col>
          <Col span={12}>
            <div className="rounded border border-slate-100 p-3">
              <Typography.Text type="secondary">Chờ vào</Typography.Text>
              <div className="mt-1 font-semibold">{formatAccountMoney(account, account.pendingIn)}</div>
            </div>
          </Col>
          <Col span={12}>
            <div className="rounded border border-slate-100 p-3">
              <Typography.Text type="secondary">Chờ ra</Typography.Text>
              <div className="mt-1 font-semibold">{formatAccountMoney(account, account.pendingOut)}</div>
            </div>
          </Col>
        </Row>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">Đối chiếu</Typography.Text>
            <Tag color={reconciliation.color} icon={reconciliation.icon}>{reconciliation.label}</Tag>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">Lần cuối</Typography.Text>
            <Typography.Text>{account.lastReconciledAt}</Typography.Text>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">Phạm vi</Typography.Text>
            <Typography.Text className="text-right">{account.ownerScope}</Typography.Text>
          </div>
          <Typography.Paragraph className="mb-0! text-slate-600">{account.purpose}</Typography.Paragraph>
          <Space wrap size={[6, 6]}>
            {account.linkedModules.map((moduleName) => (
              <Tag key={moduleName}>{moduleName}</Tag>
            ))}
          </Space>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-4">
        <Button icon={<EyeOutlined />} onClick={(event) => { event.stopPropagation(); navigate(movementsPath); }}>Giao dịch</Button>
        <Button icon={<SwapOutlined />} onClick={(event) => { event.stopPropagation(); navigate(movementsPath); }}>Nộp/Rút</Button>
        <Button icon={<AuditOutlined />} onClick={(event) => event.stopPropagation()}>Đối chiếu</Button>
        <Button icon={<DownloadOutlined />} onClick={(event) => event.stopPropagation()}>Sao kê</Button>
      </div>
    </Card>
  );
}

export function BankAccountsPage() {
  const { data: bankAccountsMock } = useBankAccountsView();
  const [keyword, setKeyword] = useState('');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredAccounts = useMemo(
    () =>
      bankAccountsMock.filter((account) => {
        const text = `${account.bankCode} ${account.bankName} ${account.accountName} ${account.accountNumber} ${account.ownerScope}`.toLowerCase();
        const matchesKeyword = text.includes(keyword.toLowerCase());
        const matchesBank = bankFilter === 'ALL' || account.bankCode === bankFilter;
        const matchesStatus = statusFilter === 'ALL' || account.status === statusFilter;
        return matchesKeyword && matchesBank && matchesStatus;
      }),
    [bankFilter, keyword, statusFilter],
  );

  const totalVnd = bankAccountsMock
    .filter((account) => account.currency === 'VND')
    .reduce((sum, account) => sum + account.balance, 0);
  const totalUsd = bankAccountsMock
    .filter((account) => account.currency === 'USD')
    .reduce((sum, account) => sum + account.balance, 0);
  const pendingReconciliation = bankAccountsMock.filter((account) => account.reconciliationStatus !== 'MATCHED').length;
  const todayTransactionCount = bankAccountsMock.reduce((sum, account) => sum + account.transactionCountToday, 0);

  return (
    <PageScaffold
      title="Ngân Hàng"
      description="Theo dõi từng tài khoản ngân hàng, số dư, dòng tiền trong ngày và trạng thái đối chiếu."
      moduleName="bank-management"
      extra={(
        <Space wrap>
          <Button icon={<ReloadOutlined />}>Đồng bộ sao kê</Button>
          <Button type="primary" icon={<PlusOutlined />}>Thêm tài khoản</Button>
        </Space>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Tổng VND ngân hàng" value={totalVnd} formatter={(value) => formatVnd(Number(value))} /></Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Tổng USD ngân hàng" value={totalUsd} formatter={(value) => formatUsd(Number(value))} /></Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Chờ đối chiếu" value={pendingReconciliation} suffix="TK" /></Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Giao dịch hôm nay" value={formatNumber(todayTransactionCount)} /></Card>
          </Col>
        </Row>

        <Card>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} lg={10}>
              <Input.Search
                allowClear
                placeholder="Tìm ngân hàng, số tài khoản, phạm vi..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select className="w-full" value={bankFilter} onChange={setBankFilter} options={[...bankOptions]} />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select className="w-full" value={statusFilter} onChange={setStatusFilter} options={[...statusOptions]} />
            </Col>
            <Col xs={24} lg={4}>
              <Button className="w-full" icon={<FilterOutlined />}>Bộ lọc nâng cao</Button>
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          {filteredAccounts.map((account) => (
            <Col xs={24} xl={12} key={account.key}>
              <BankAccountCard account={account} />
            </Col>
          ))}
        </Row>
      </Space>
    </PageScaffold>
  );
}
