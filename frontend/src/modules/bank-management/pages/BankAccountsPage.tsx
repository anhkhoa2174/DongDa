// Ngân hàng — danh sách tài khoản NH theo chi nhánh (data thật /bank/accounts).
// GĐ/KTTH: xem mọi chi nhánh, thêm tài khoản, ngưng tài khoản. Chi nhánh: chỉ tài khoản của mình.
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CheckOutlined,
  DollarOutlined,
  FilterOutlined,
  SwapOutlined,
  EyeOutlined,
  PlusOutlined,
  ShopOutlined,
  StopOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Col, Empty, Input, Popconfirm, Row, Segmented, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import { formatBankAccountLabel, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBranches } from '@/shared/hooks/useBranches';
import { useAdvances, useBankAccounts, useDeactivateBankAccount } from '../hooks/useBank';
import type { BankAccountDto, BankMovementDto } from '../api/bank.api';
import { InternalBankTransferModal } from '../components/InternalBankTransferModal';
import { SettleAdvanceModal } from '../components/SettleAdvanceModal';
import { BankMovementModal, type BankMovementDirection } from '../components/BankMovementModal';
import { CreateBankAccountModal } from '../components/CreateBankAccountModal';

function formatAccountMoney(account: BankAccountDto, value: number) {
  return account.currencyCode === 'VND' ? formatVnd(value) : formatUsd(value);
}

function BankAccountCard({
  account, pendingAdvance, canManage, canRecord, onRecord, onInternalTransfer, onDeactivate,
}: {
  account: BankAccountDto;
  pendingAdvance: number;
  canManage: boolean;
  canRecord: boolean;
  onRecord: (direction: BankMovementDirection) => void;
  onInternalTransfer: () => void;
  onDeactivate: () => void;
}) {
  const navigate = useNavigate();
  const movementsPath = `/bank-management/accounts/${account.id}/movements`;

  return (
    <article
      className="bank-account-card h-full cursor-pointer overflow-hidden"
      onClick={() => navigate(movementsPath)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(movementsPath);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="bank-account-card__header">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bank-account-card__icon">
            <BankOutlined />
          </div>
          <div className="min-w-0">
            <Typography.Text strong className="block truncate text-base!">{account.accountName}</Typography.Text>
            <Typography.Text type="secondary" className="block truncate text-xs!">
              {account.bankName} · STK {account.accountNo}
            </Typography.Text>
          </div>
        </div>
        <Tag className="bank-account-card__bank-code m-0!">{account.bankCode}</Tag>
      </div>
      <div className="bank-account-card__body">
        <div className="flex items-start justify-between gap-4">
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" className="bank-account-card__balance-label">Số dư hiện tại</Typography.Text>
            <Typography.Title level={2} className="bank-account-card__balance">
              {formatAccountMoney(account, account.currentBalance)}
            </Typography.Title>
          </Space>
          <Space direction="vertical" size={0} align="end">
            <Tag className="m-0!">{account.currencyCode}</Tag>
            {pendingAdvance > 0 && (
              <Tag color="volcano" className="m-0! mt-1!">Đang ứng {account.currencyCode === 'VND' ? formatVnd(pendingAdvance) : formatUsd(pendingAdvance)}</Tag>
            )}
          </Space>
        </div>
        <div className="bank-account-card__branch">
          <Typography.Text type="secondary"><ShopOutlined /> Chi nhánh sở hữu</Typography.Text>
          <Typography.Text strong className="text-right">
            {account.branchCode ? `${account.branchCode} - ${account.branchName ?? ''}` : '—'}
          </Typography.Text>
        </div>
      </div>

      <div className="bank-account-card__actions">
        <Button className="bank-action bank-action--in" icon={<ArrowDownOutlined />} disabled={!canRecord} onClick={(event) => { event.stopPropagation(); onRecord('IN'); }}>Tiền vào</Button>
        <Button className="bank-action bank-action--out" icon={<ArrowUpOutlined />} disabled={!canRecord} onClick={(event) => { event.stopPropagation(); onRecord('OUT'); }}>Tiền ra</Button>
        <Button className="bank-action bank-action--transfer" icon={<SwapOutlined />} disabled={!canManage}
          onClick={(event) => { event.stopPropagation(); onInternalTransfer(); }}>CK nội bộ</Button>
        <Button className="bank-action" icon={<EyeOutlined />} onClick={(event) => { event.stopPropagation(); navigate(movementsPath); }}>Lịch sử</Button>
        {canManage ? (
          <Popconfirm
            title="Ngưng tài khoản này?"
            description="Chỉ ngưng được khi số dư = 0. Lịch sử biến động vẫn được giữ."
            okText="Ngưng"
            cancelText="Hủy"
            onConfirm={onDeactivate}
            onPopupClick={(event) => event.stopPropagation()}
          >
            <Button className="bank-action bank-action--muted" icon={<StopOutlined />} onClick={(event) => event.stopPropagation()}>Ngưng</Button>
          </Popconfirm>
        ) : <span />}
      </div>
    </article>
  );
}

export function BankAccountsPage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const isBranchUser = user?.role === 'branch';
  const canManage = user?.role === 'director' || user?.role === 'accountant';
  const canRecord = canManage;

  const [branchFilter, setBranchFilter] = useState<string | undefined>(undefined);
  const { data: branches = [] } = useBranches();
  const { data: accounts = [], isLoading } = useBankAccounts(isBranchUser ? undefined : branchFilter);
  const { data: allAccounts = [] } = useBankAccounts(undefined, canManage);
  const deactivate = useDeactivateBankAccount();
  const [keyword, setKeyword] = useState('');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [recording, setRecording] = useState<{ account: BankAccountDto; direction: BankMovementDirection } | null>(null);
  const [internalTransferSource, setInternalTransferSource] = useState<BankAccountDto | null>(null);
  // Tạm ứng CK chỉ được sinh từ giao dịch "Nhận tiền mặt, chuyển khoản".
  const [advanceTab, setAdvanceTab] = useState<'ADVANCE_CK' | 'SETTLED' | 'VOIDED'>('ADVANCE_CK');
  const { data: pendingAdvances = [] } = useAdvances({ status: 'ADVANCE_CK', branchId: isBranchUser ? undefined : branchFilter });
  const { data: settledAdvances = [] } = useAdvances({ status: 'SETTLED', branchId: isBranchUser ? undefined : branchFilter }, advanceTab === 'SETTLED');
  const { data: voidedAdvances = [] } = useAdvances({ status: 'VOIDED', branchId: isBranchUser ? undefined : branchFilter }, advanceTab === 'VOIDED');
  // Tổng đang ứng theo tài khoản -> hiện trên thẻ TK để thấy ngay TK nào còn treo
  const pendingByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const adv of pendingAdvances) map.set(adv.bankAccountId, (map.get(adv.bankAccountId) ?? 0) + adv.amount);
    return map;
  }, [pendingAdvances]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // Hoàn ứng phải chọn nguồn đối ứng (quỹ tiền mặt CN / TK ngân hàng khác) -> mở form
  const [settling, setSettling] = useState<BankMovementDto | null>(null);
  const advanceCols: ColumnsType<BankMovementDto> = [
    { title: 'Ngày', dataIndex: 'businessDate', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Số phiếu', dataIndex: 'movementNo', width: 200 },
    { title: 'Tài khoản', dataIndex: 'bankAccountId', render: (id: string) => { const a = accountById.get(id); return a ? formatBankAccountLabel(a) : id.slice(0, 8); } },
    { title: 'Chi nhánh', dataIndex: 'bankAccountId', render: (id: string) => { const a = accountById.get(id); return a?.branchCode ?? '—'; } },
    { title: 'Nội dung', dataIndex: 'description', ellipsis: true },
    { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v: number, r) => (r.currencyCode === 'VND' ? formatVnd(v) : formatUsd(v)) },
    ...(advanceTab === 'SETTLED' ? [
      { title: 'Đã hoàn lúc', dataIndex: 'settledAt', width: 130,
        render: (v: string | null) => (v ? dayjs(v).format('DD/MM HH:mm') : '—') },
      { title: 'Nguồn hoàn (tiền bị trừ ở đâu)', dataIndex: 'settledDescription', ellipsis: true,
        render: (v: string | null) => v ?? '—' },
    ] : []),
    ...(advanceTab === 'VOIDED' ? [
      { title: 'Đã hủy lúc', dataIndex: 'voidedAt', width: 130,
        render: (v: string | null) => (v ? dayjs(v).format('DD/MM HH:mm') : '—') },
      { title: 'Lý do hủy', dataIndex: 'voidReason', ellipsis: true,
        render: (v: string | null) => v ?? '—' },
    ] : []),
    ...(canManage && advanceTab === 'ADVANCE_CK' ? [{
      title: '', width: 110,
      render: (_: unknown, r: BankMovementDto) => (
        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setSettling(r)}>Hoàn</Button>
      ),
    }] : []),
  ];

  const bankOptions = useMemo(
    () => [{ value: 'ALL', label: 'Tất cả ngân hàng' }, ...[...new Set(accounts.map((a) => a.bankCode))].map((code) => ({ value: code, label: code }))],
    [accounts],
  );
  const filteredAccounts = useMemo(
    () => accounts.filter((account) => {
      const text = `${account.bankCode} ${account.bankName} ${account.accountName} ${account.accountNo} ${account.branchCode ?? ''} ${account.branchName ?? ''}`.toLowerCase();
      return text.includes(keyword.toLowerCase()) && (bankFilter === 'ALL' || account.bankCode === bankFilter);
    }),
    [accounts, bankFilter, keyword],
  );

  const totalVnd = accounts.filter((a) => a.currencyCode === 'VND').reduce((sum, a) => sum + a.currentBalance, 0);
  const totalUsd = accounts.filter((a) => a.currencyCode === 'USD').reduce((sum, a) => sum + a.currentBalance, 0);
  const branchCount = new Set(accounts.map((a) => a.branchId)).size;

  const onDeactivate = async (account: BankAccountDto) => {
    try {
      await deactivate.mutateAsync(account.id);
      message.success(`Đã ngưng tài khoản ${account.accountNo}`);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Không ngưng được tài khoản'));
    }
  };

  return (
    <PageScaffold
      title="Ngân Hàng"
      description={isBranchUser
        ? 'Tài khoản ngân hàng của chi nhánh: theo dõi số dư và ghi nhận tiền vào/ra (chuyển khoản, nộp/rút).'
        : 'Mỗi chi nhánh có tài khoản ngân hàng riêng. Theo dõi số dư, ghi nhận chuyển khoản/nộp/rút và tiền WU/MG về.'}
      moduleName="bank-management"
      extra={canManage ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Thêm tài khoản</Button>
      ) : undefined}
    >
      <Space direction="vertical" size={16} className="w-full">
        <OperationalOverviewCard
          eyebrow="Tổng quan ngân hàng"
          title="Số dư ngân hàng"
          icon={<BankOutlined />}
          meta={`${accounts.length} tài khoản đang hoạt động trên ${branchCount} chi nhánh`}
          metrics={[
            { label: 'Tổng VND', value: formatVnd(totalVnd), note: 'Số dư thực tế', icon: <WalletOutlined /> },
            { label: 'Tổng USD', value: formatUsd(totalUsd), note: 'Số dư thực tế', icon: <DollarOutlined /> },
            { label: 'Tài khoản', value: `${accounts.length} TK`, note: 'Đang theo dõi', icon: <BankOutlined /> },
            { label: 'Chi nhánh', value: `${branchCount} CN`, note: 'Có tài khoản', icon: <ShopOutlined /> },
          ]}
          loading={isLoading}
        />

        <Card className="bank-advance-card" classNames={{ body: 'p-0!' }}>
          <div className="bank-advance-card__header">
            <div>
              <Typography.Text className="bank-section-heading__eyebrow">Giao dịch chuyển tiền</Typography.Text>
              <Typography.Title level={4}>Tạm ứng chuyển khoản</Typography.Title>
              <Typography.Text type="secondary">Các khoản phát sinh khi nhận tiền mặt và chuyển khoản.</Typography.Text>
            </div>
            <Segmented
              value={advanceTab}
              onChange={(value) => setAdvanceTab(value as 'ADVANCE_CK' | 'SETTLED' | 'VOIDED')}
              options={[
                { value: 'ADVANCE_CK', label: `Chưa hoàn (${pendingAdvances.length})` },
                { value: 'SETTLED', label: 'Đã hoàn' },
                { value: 'VOIDED', label: 'Đã hủy' },
              ]}
            />
          </div>
          <Table<BankMovementDto> rowKey="id" size="small" columns={advanceCols}
            dataSource={advanceTab === 'ADVANCE_CK'
              ? pendingAdvances
              : advanceTab === 'SETTLED'
                ? settledAdvances
                : voidedAdvances}
            pagination={{ pageSize: 8, hideOnSinglePage: true }} scroll={{ x: 820 }}
            locale={{
              emptyText: advanceTab === 'ADVANCE_CK'
                ? 'Không có khoản tạm ứng nào đang chờ hoàn'
                : advanceTab === 'SETTLED'
                  ? 'Chưa có khoản nào được hoàn'
                  : 'Chưa có phiếu tạm ứng nào đã hủy',
            }} />
        </Card>

        <Card className="bank-account-directory" classNames={{ body: 'p-0!' }}>
          <div className="bank-account-directory__header">
            <div className="bank-section-heading">
              <div>
                <Typography.Text className="bank-section-heading__eyebrow"><FilterOutlined /> Danh sách và bộ lọc</Typography.Text>
                <Typography.Title level={3}>Tài khoản ngân hàng</Typography.Title>
              </div>
              <Tag className="m-0!">{filteredAccounts.length} tài khoản</Tag>
            </div>
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} lg={isBranchUser ? 16 : 10}>
                <Input.Search
                  allowClear
                  placeholder="Tìm ngân hàng, số tài khoản, chi nhánh..."
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </Col>
              {!isBranchUser && (
                <Col xs={24} sm={12} lg={7}>
                  <Select
                    className="w-full"
                    allowClear
                    placeholder="Tất cả chi nhánh"
                    value={branchFilter}
                    onChange={(value) => setBranchFilter(value || undefined)}
                    options={branches.map((b) => ({ value: b.id, label: `${b.code} - ${b.name}` }))}
                  />
                </Col>
              )}
              <Col xs={24} sm={12} lg={isBranchUser ? 8 : 7}>
                <Select className="w-full" value={bankFilter} onChange={setBankFilter} options={bankOptions} />
              </Col>
            </Row>
          </div>
          <div className="bank-account-directory__body">
            {!isLoading && filteredAccounts.length === 0 ? (
              <Empty description={canManage ? 'Chưa có tài khoản ngân hàng. Bấm "Thêm tài khoản" để khai báo cho từng chi nhánh.' : 'Chi nhánh chưa được khai báo tài khoản ngân hàng. Liên hệ KTTH/GĐ.'} />
            ) : (
              <Row gutter={[16, 16]}>
                {filteredAccounts.map((account) => (
                  <Col xs={24} xl={12} key={account.id}>
                    <BankAccountCard
                      account={account}
                      pendingAdvance={pendingByAccount.get(account.id) ?? 0}
                      canManage={canManage}
                      canRecord={canRecord}
                      onRecord={(direction) => setRecording({ account, direction })}
                      onInternalTransfer={() => setInternalTransferSource(account)}
                      onDeactivate={() => onDeactivate(account)}
                    />
                  </Col>
                ))}
              </Row>
            )}
          </div>
        </Card>
      </Space>

      <CreateBankAccountModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {settling && <SettleAdvanceModal advance={settling} accounts={allAccounts} open onClose={() => setSettling(null)} />}
      {internalTransferSource && (
        <InternalBankTransferModal
          accounts={allAccounts}
          sourceAccount={internalTransferSource}
          open
          onClose={() => setInternalTransferSource(null)}
        />
      )}
      {recording && (
        <BankMovementModal
          account={recording.account}
          direction={recording.direction}
          open
          onClose={() => setRecording(null)}
        />
      )}
    </PageScaffold>
  );
}
