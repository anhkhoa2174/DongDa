// Lịch sử biến động số dư 1 tài khoản ngân hàng (data thật /bank/movements) + ghi tiền vào/ra.
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  BankOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBankAccounts, useBankMovements } from '../hooks/useBank';
import type { BankAccountDto, BankMovementDto, BankMovementType } from '../api/bank.api';
import { BankMovementModal, type BankMovementDirection } from '../components/BankMovementModal';
import { AdvanceCkModal } from '../components/AdvanceCkModal';

const movementMeta: Record<BankMovementType, { label: string; color: string; inflow: boolean }> = {
  DEPOSIT: { label: 'Tiền vào', color: 'green', inflow: true },
  TRANSFER_IN: { label: 'Nhận CK', color: 'cyan', inflow: true },
  WITHDRAW: { label: 'Rút tiền', color: 'red', inflow: false },
  TRANSFER_OUT: { label: 'Chuyển đi', color: 'orange', inflow: false },
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
  const canRecord = user?.role === 'director' || user?.role === 'accountant' || user?.role === 'branch';
  const [direction, setDirection] = useState<BankMovementDirection | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
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
          {canRecord && <Button icon={<ArrowDownOutlined />} onClick={() => setDirection('IN')}>Tiền vào</Button>}
          {canRecord && <Button danger icon={<ArrowUpOutlined />} onClick={() => setDirection('OUT')}>Tiền ra</Button>}
          {canRecord && <Button icon={<SwapOutlined />} style={{ background: '#111', color: '#f5b301', borderColor: '#111' }} onClick={() => setAdvanceOpen(true)}>Ứng CK</Button>}
        </Space>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="polished-card">
          <div className="mb-5 flex items-start justify-between gap-4 max-lg:flex-col">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xl text-black">
                <BankOutlined />
              </div>
              <div className="min-w-0">
                <Typography.Title level={3} className="mb-1! truncate">{account.accountName}</Typography.Title>
                <Typography.Text type="secondary">
                  {account.bankName} · STK {account.accountNo} · {account.currencyCode}
                </Typography.Text>
              </div>
            </div>
            <Tag color="cyan" className="m-0!">
              {account.branchCode ? `${account.branchCode} - ${account.branchName ?? ''}` : 'Chưa gán chi nhánh'}
            </Tag>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic title="Số dư hiện tại" value={account.currentBalance} formatter={(value) => formatAccountMoney(account, Number(value))} />
            </Col>
            <Col xs={24} md={8}>
              <Statistic title="Tiền vào hôm nay" value={todayIn} valueStyle={{ color: '#047857' }} formatter={(value) => formatAccountMoney(account, Number(value))} />
            </Col>
            <Col xs={24} md={8}>
              <Statistic title="Tiền ra hôm nay" value={todayOut} valueStyle={{ color: '#be123c' }} formatter={(value) => formatAccountMoney(account, Number(value))} />
            </Col>
          </Row>
        </Card>

        <Card title="Lịch sử biến động số dư" className="polished-card">
          <Table columns={columns} dataSource={movements} rowKey="id" scroll={{ x: 1000 }} pagination={{ pageSize: 20 }} />
        </Card>
      </Space>

      {direction && (
        <BankMovementModal account={account} direction={direction} open onClose={() => setDirection(null)} />
      )}
      <AdvanceCkModal account={account} open={advanceOpen} onClose={() => setAdvanceOpen(false)} />
    </PageScaffold>
  );
}
