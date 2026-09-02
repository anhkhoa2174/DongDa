// Lịch sử biến động số dư 1 tài khoản ngân hàng (data thật /bank/movements) + ghi tiền vào/ra.
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CalendarOutlined,
  DollarOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import { formatDateTime, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBankAccounts, useBankMovements } from '../hooks/useBank';
import type { BankAccountDto, BankMovementDto, BankMovementType } from '../api/bank.api';
import { BankMovementModal, type BankMovementDirection } from '../components/BankMovementModal';
import { InternalBankTransferModal } from '../components/InternalBankTransferModal';

const movementMeta: Record<BankMovementType, { label: string; color: string; inflow: boolean }> = {
  DEPOSIT: { label: 'Nạp từ quỹ', color: 'green', inflow: true },
  TRANSFER_IN: { label: 'Nhận CK', color: 'cyan', inflow: true },
  WITHDRAW: { label: 'Rút tiền mặt', color: 'red', inflow: false },
  TRANSFER_OUT: { label: 'Chuyển khoản đi', color: 'orange', inflow: false },
  RECONCILIATION: { label: 'Đối chiếu', color: 'gold', inflow: true },
  ADVANCE_CK: { label: 'Ứng CK', color: 'volcano', inflow: false },
  ADVANCE_SETTLE: { label: 'Hoàn ứng CK', color: 'geekblue', inflow: true },
};

function formatAccountMoney(account: BankAccountDto, value: number) {
  return account.currencyCode === 'VND' ? formatVnd(value) : formatUsd(value);
}

export function BankAccountMovementsPage() {
  const { accountKey } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canManage = user?.role === 'director' || user?.role === 'accountant';
  const canRecord = canManage;
  const [direction, setDirection] = useState<BankMovementDirection | null>(null);
  const [internalTransferOpen, setInternalTransferOpen] = useState(false);
  const { data: accounts = [], isLoading } = useBankAccounts();
  const { data: movements = [] } = useBankMovements(accountKey);
  const account = accounts.find((a) => a.id === accountKey);

  if (!account) {
    return (
      <PageScaffold title="Lịch sử biến động" description="Theo dõi biến động số dư của từng tài khoản ngân hàng." moduleName="bank-management">
        <Card>
          <Empty description={isLoading ? 'Đang tải...' : 'Không tìm thấy tài khoản ngân hàng'} />
          <Button className="mt-4" icon={<ArrowLeftOutlined />} onClick={() => navigate('/bank-management/accounts')}>
            Quay lại danh sách
          </Button>
        </Card>
      </PageScaffold>
    );
  }

  const today = dayjs().format('YYYY-MM-DD');
  const todayMovements = movements.filter((m) => dayjs(m.businessDate).format('YYYY-MM-DD') === today);
  const todayIn = todayMovements.filter((m) => movementMeta[m.movementType]?.inflow).reduce((s, m) => s + m.amount, 0);
  const todayOut = todayMovements.filter((m) => !movementMeta[m.movementType]?.inflow).reduce((s, m) => s + m.amount, 0);

  const columns: ColumnsType<BankMovementDto> = [
    { title: 'Ngày NV', dataIndex: 'businessDate', width: 100, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Ghi lúc', dataIndex: 'createdAt', width: 150, render: (v: string) => formatDateTime(v) },
    {
      title: 'Loại',
      dataIndex: 'movementType',
      width: 110,
      render: (value: BankMovementType) => <Tag color={movementMeta[value]?.color}>{movementMeta[value]?.label ?? value}</Tag>,
    },
    {
      title: 'Nội dung',
      dataIndex: 'description',
      render: (value: string | null, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{value || '—'}</Typography.Text>
          {record.bankReference ? <Typography.Text type="secondary" className="text-xs!">Ref: {record.bankReference}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      align: 'right',
      render: (value: number, record) => {
        const inflow = movementMeta[record.movementType]?.inflow;
        return (
          <Typography.Text strong className={inflow ? 'text-emerald-700' : 'text-rose-700'}>
            {inflow ? '+' : '−'}{formatAccountMoney(account, value)}
          </Typography.Text>
        );
      },
    },
    { title: 'Số dư trước', dataIndex: 'balanceBefore', align: 'right', render: (value: number) => formatAccountMoney(account, value) },
    { title: 'Số dư sau', dataIndex: 'balanceAfter', align: 'right', render: (value: number) => formatAccountMoney(account, value) },
  ];

  return (
    <PageScaffold
      title="Lịch sử biến động"
      description="Theo dõi biến động số dư của từng tài khoản ngân hàng."
      moduleName="bank-management"
      extra={(
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/bank-management/accounts')}>Danh sách tài khoản</Button>
          {canRecord && <Button className="bank-action bank-action--in" icon={<ArrowDownOutlined />} onClick={() => setDirection('IN')}>Tiền vào</Button>}
          {canRecord && <Button className="bank-action bank-action--out" icon={<ArrowUpOutlined />} onClick={() => setDirection('OUT')}>Tiền ra</Button>}
          {canManage && <Button className="bank-action bank-action--transfer" icon={<SwapOutlined />} onClick={() => setInternalTransferOpen(true)}>CK nội bộ</Button>}
        </Space>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        <OperationalOverviewCard
          eyebrow={`${account.bankCode} · ${account.currencyCode}`}
          title={account.accountName}
          icon={<BankOutlined />}
          meta={`${account.bankName} · STK ${account.accountNo}`}
          aside={<Tag className="bank-account-branch-tag">{account.branchCode ? `${account.branchCode} - ${account.branchName ?? ''}` : 'Chưa gán chi nhánh'}</Tag>}
          metrics={[
            { label: 'Số dư hiện tại', value: formatAccountMoney(account, account.currentBalance), note: account.currencyCode, icon: <DollarOutlined /> },
            { label: 'Tiền vào hôm nay', value: formatAccountMoney(account, todayIn), note: `${todayMovements.filter((m) => movementMeta[m.movementType]?.inflow).length} biến động`, icon: <ArrowDownOutlined /> },
            { label: 'Tiền ra hôm nay', value: formatAccountMoney(account, todayOut), note: `${todayMovements.filter((m) => !movementMeta[m.movementType]?.inflow).length} biến động`, icon: <ArrowUpOutlined /> },
            { label: 'Ngày nghiệp vụ', value: dayjs().format('DD/MM/YYYY'), note: `${todayMovements.length} biến động hôm nay`, icon: <CalendarOutlined /> },
          ]}
        />

        <Card
          title={<span className="section-card-title"><BankOutlined /> Lịch sử biến động số dư</span>}
          extra={<Typography.Text type="secondary">{movements.length} biến động</Typography.Text>}
          className="polished-card bank-movement-history"
          classNames={{ body: 'p-0!' }}
        >
          <Table columns={columns} dataSource={movements} rowKey="id" scroll={{ x: 920 }} pagination={{ pageSize: 20, showSizeChanger: false }} />
        </Card>
      </Space>

      {direction && (
        <BankMovementModal account={account} direction={direction} open onClose={() => setDirection(null)} />
      )}
      <InternalBankTransferModal
        accounts={accounts}
        sourceAccount={account}
        open={internalTransferOpen}
        onClose={() => setInternalTransferOpen(false)}
      />
    </PageScaffold>
  );
}
