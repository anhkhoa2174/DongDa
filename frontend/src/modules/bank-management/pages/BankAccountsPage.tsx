// Ngân hàng — danh sách tài khoản NH theo chi nhánh (data thật /bank/accounts).
// GĐ/KTTH: xem mọi chi nhánh, thêm tài khoản, ngưng tài khoản. Chi nhánh: chỉ tài khoản của mình.
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BankOutlined,
  EyeOutlined,
  PlusOutlined,
  ShopOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Col, Empty, Input, Popconfirm, Row, Select, Space, Statistic, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatUsd, formatVnd } from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBranches } from '@/shared/hooks/useBranches';
import { useBankAccounts, useDeactivateBankAccount } from '../hooks/useBank';
import type { BankAccountDto } from '../api/bank.api';
import { BankMovementModal, type BankMovementDirection } from '../components/BankMovementModal';
import { CreateBankAccountModal } from '../components/CreateBankAccountModal';

function formatAccountMoney(account: BankAccountDto, value: number) {
  return account.currencyCode === 'VND' ? formatVnd(value) : formatUsd(value);
}

function BankAccountCard({
  account, canManage, canRecord, onRecord, onDeactivate,
}: {
  account: BankAccountDto;
  canManage: boolean;
  canRecord: boolean;
  onRecord: (direction: BankMovementDirection) => void;
  onDeactivate: () => void;
}) {
  const navigate = useNavigate();
  const movementsPath = `/bank-management/accounts/${account.id}/movements`;

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
            <Typography.Text type="secondary" className="block truncate text-xs!">
              {account.bankName} · STK {account.accountNo}
            </Typography.Text>
          </div>
        </div>
      )}
      extra={<Tag color="cyan" className="m-0!">{account.bankCode}</Tag>}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" className="uppercase tracking-normal!">Số dư hiện tại</Typography.Text>
            <Typography.Title level={2} className="m-0! text-3xl! leading-tight!">
              {formatAccountMoney(account, account.currentBalance)}
            </Typography.Title>
          </Space>
          <Tag className="m-0!">{account.currencyCode}</Tag>
        </div>
        <div className="flex items-center justify-between gap-3 rounded bg-slate-50 p-3">
          <Typography.Text type="secondary"><ShopOutlined /> Chi nhánh sở hữu</Typography.Text>
          <Typography.Text strong className="text-right">
            {account.branchCode ? `${account.branchCode} - ${account.branchName ?? ''}` : '—'}
          </Typography.Text>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-4">
        <Button icon={<EyeOutlined />} onClick={(event) => { event.stopPropagation(); navigate(movementsPath); }}>Lịch sử</Button>
        <Button icon={<ArrowDownOutlined />} disabled={!canRecord} onClick={(event) => { event.stopPropagation(); onRecord('IN'); }}>Tiền vào</Button>
        <Button danger icon={<ArrowUpOutlined />} disabled={!canRecord} onClick={(event) => { event.stopPropagation(); onRecord('OUT'); }}>Tiền ra</Button>
        {canManage ? (
          <Popconfirm
            title="Ngưng tài khoản này?"
            description="Chỉ ngưng được khi số dư = 0. Lịch sử biến động vẫn được giữ."
            okText="Ngưng"
            cancelText="Hủy"
            onConfirm={onDeactivate}
            onPopupClick={(event) => event.stopPropagation()}
          >
            <Button icon={<StopOutlined />} onClick={(event) => event.stopPropagation()}>Ngưng</Button>
          </Popconfirm>
        ) : <span />}
      </div>
    </Card>
  );
}

export function BankAccountsPage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const isBranchUser = user?.role === 'branch';
  const canManage = user?.role === 'director' || user?.role === 'accountant';
  const canRecord = canManage || isBranchUser;

  const [branchFilter, setBranchFilter] = useState<string | undefined>(undefined);
  const { data: branches = [] } = useBranches();
  const { data: accounts = [], isLoading } = useBankAccounts(isBranchUser ? undefined : branchFilter);
  const deactivate = useDeactivateBankAccount();
  const [keyword, setKeyword] = useState('');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [recording, setRecording] = useState<{ account: BankAccountDto; direction: BankMovementDirection } | null>(null);

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
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Tổng VND ngân hàng" value={totalVnd} formatter={(value) => formatVnd(Number(value))} /></Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Tổng USD ngân hàng" value={totalUsd} formatter={(value) => formatUsd(Number(value))} /></Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Số tài khoản" value={accounts.length} suffix="TK" /></Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card><Statistic title="Chi nhánh có tài khoản" value={branchCount} suffix="CN" /></Card>
          </Col>
        </Row>

        <Card>
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
        </Card>

        {!isLoading && filteredAccounts.length === 0 ? (
          <Card>
            <Empty description={canManage ? 'Chưa có tài khoản ngân hàng. Bấm "Thêm tài khoản" để khai báo cho từng chi nhánh.' : 'Chi nhánh chưa được khai báo tài khoản ngân hàng. Liên hệ KTTH/GĐ.'} />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {filteredAccounts.map((account) => (
              <Col xs={24} xl={12} key={account.id}>
                <BankAccountCard
                  account={account}
                  canManage={canManage}
                  canRecord={canRecord}
                  onRecord={(direction) => setRecording({ account, direction })}
                  onDeactivate={() => onDeactivate(account)}
                />
              </Col>
            ))}
          </Row>
        )}
      </Space>

      <CreateBankAccountModal open={createOpen} onClose={() => setCreateOpen(false)} />
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
