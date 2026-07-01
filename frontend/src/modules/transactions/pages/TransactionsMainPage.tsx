import {
  BankOutlined,
  InboxOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatCurrency } from '@/shared/utils/formatters';
import { isUiTestMode } from '@/shared/config/runtime';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useShiftStore } from '@/modules/shift-management/model/shift.store';
import { WesternUnionTransactionsPage } from '@/modules/western-union/pages/WesternUnionTransactionsPage';
import { MoneyGramTransactionsPage } from '@/modules/moneygram/pages/MoneyGramTransactionsPage';
import { ForeignExchangeTransactionsPage } from '@/modules/foreign-exchange/pages/ForeignExchangeTransactionsPage';
import { DomesticTransferTransactionsPage } from '@/modules/domestic-transfer/pages/DomesticTransferTransactionsPage';
import { getTransactionAccess } from '../model/transactionAccess';
import { aggregatedTransactionsMock } from '../data/transactions.mock';
import type { AggregatedTransaction, TransactionSource, TransactionStatus } from '../model/transaction.types';

const sourceMeta: Record<TransactionSource, { label: string; color: string; path: string }> = {
  WU: { label: 'Western Union', color: 'blue', path: '/western-union/transactions' },
  MG: { label: 'MoneyGram', color: 'cyan', path: '/moneygram/transactions' },
  FX: { label: 'Ngoại tệ', color: 'green', path: '/foreign-exchange/trading' },
  DOMESTIC: { label: 'Chuyển tiền', color: 'purple', path: '/domestic-transfer/transactions' },
};

const statusMeta: Record<TransactionStatus, { label: string; color: string }> = {
  COMPLETED: { label: 'Hoàn tất', color: 'green' },
  PENDING: { label: 'Chờ xử lý', color: 'gold' },
  VOID: { label: 'Đã void', color: 'red' },
  ADJUSTED: { label: 'Đã điều chỉnh', color: 'blue' },
};

const createActions = [
  { key: 'WU', label: 'Tạo WU', icon: <SendOutlined />, modalTitle: 'Tạo giao dịch Western Union' },
  { key: 'MG', label: 'Tạo MG', icon: <InboxOutlined />, modalTitle: 'Tạo giao dịch MoneyGram' },
  { key: 'FX', label: 'Mua/Bán ngoại tệ', icon: <SwapOutlined />, modalTitle: 'Tạo giao dịch ngoại tệ' },
  { key: 'DOMESTIC', label: 'Chuyển tiền', icon: <BankOutlined />, modalTitle: 'Tạo giao dịch chuyển tiền' },
];

export function TransactionsMainPage() {
  const role = useAuthStore((state) => state.user?.role);
  const currentShift = useShiftStore((state) => state.currentShift);
  const access = getTransactionAccess(role, currentShift);
  const [keyword, setKeyword] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | TransactionSource>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransactionStatus>('ALL');
  const [activeCreateSource, setActiveCreateSource] = useState<TransactionSource | null>(null);

  const filteredTransactions = useMemo(
    () =>
      aggregatedTransactionsMock.filter((transaction) => {
        const matchesKeyword = JSON.stringify(transaction).toLowerCase().includes(keyword.toLowerCase());
        const matchesSource = sourceFilter === 'ALL' || transaction.source === sourceFilter;
        const matchesStatus = statusFilter === 'ALL' || transaction.status === statusFilter;
        return matchesKeyword && matchesSource && matchesStatus;
      }),
    [keyword, sourceFilter, statusFilter],
  );

  const columns: ColumnsType<AggregatedTransaction> = [
    {
      title: 'Mã GD',
      dataIndex: 'code',
      fixed: 'left',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    { title: 'Nguồn', dataIndex: 'source', render: (value: TransactionSource) => <Tag color={sourceMeta[value].color}>{sourceMeta[value].label}</Tag> },
    { title: 'Loại giao dịch', dataIndex: 'type' },
    { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
    { title: 'Số tiền', dataIndex: 'amountLabel', align: 'right' },
    { title: 'Quy đổi VND', dataIndex: 'vndAmount', align: 'right', render: (value: number) => formatCurrency(value) },
    { title: 'Chi nhánh', dataIndex: 'branch' },
    { title: 'Ca', dataIndex: 'shiftCode' },
    { title: 'Thời gian', dataIndex: 'createdAt' },
    { title: 'Trạng thái', dataIndex: 'status', render: (value: TransactionStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag> },
  ];

  const totalVnd = aggregatedTransactionsMock.reduce((sum, transaction) => sum + transaction.vndAmount, 0);
  const canCreate = access.canCreate || isUiTestMode;
  const activeCreateAction = createActions.find((action) => action.key === activeCreateSource);

  const renderCreateForm = () => {
    const closeModal = () => setActiveCreateSource(null);

    if (activeCreateSource === 'WU') return <WesternUnionTransactionsPage createOnly onCreated={closeModal} />;
    if (activeCreateSource === 'MG') return <MoneyGramTransactionsPage createOnly onCreated={closeModal} />;
    if (activeCreateSource === 'FX') return <ForeignExchangeTransactionsPage createOnly onCreated={closeModal} />;
    if (activeCreateSource === 'DOMESTIC') return <DomesticTransferTransactionsPage createOnly onCreated={closeModal} />;
    return null;
  };

  return (
    <PageScaffold
      title="Tổng hợp Giao Dịch"
      description="Theo dõi tập trung WU, MoneyGram, ngoại tệ và chuyển tiền nội địa trên toàn hệ thống."
      moduleName="transactions"
    >
      <div className="space-y-4">
        <Card title="Tạo giao dịch">
          <Space wrap>
            {createActions.map((action) => (
              <Button
                key={action.label}
                type="primary"
                ghost
                icon={action.icon}
                disabled={!canCreate}
                onClick={() => setActiveCreateSource(action.key as TransactionSource)}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tổng giao dịch" value={aggregatedTransactionsMock.length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="WU / MG" value={aggregatedTransactionsMock.filter((item) => ['WU', 'MG'].includes(item.source)).length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Ngoại tệ / Chuyển tiền" value={aggregatedTransactionsMock.filter((item) => ['FX', 'DOMESTIC'].includes(item.source)).length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tổng quy đổi" value={totalVnd} suffix="₫" /></Card></Col>
        </Row>

        <Card>
          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={24} lg={8}>
              <Input.Search allowClear placeholder="Tìm mã GD, khách hàng, ca..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select className="w-full" value={sourceFilter} onChange={setSourceFilter} options={[{ value: 'ALL', label: 'Tất cả nguồn' }, ...Object.entries(sourceMeta).map(([value, meta]) => ({ value, label: meta.label }))]} />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select className="w-full" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))]} />
            </Col>
            <Col xs={24} lg={6}><DatePicker.RangePicker className="w-full" format="DD/MM/YYYY" /></Col>
          </Row>
          <Table columns={columns} dataSource={filteredTransactions} scroll={{ x: 1400 }} pagination={{ pageSize: 10 }} />
        </Card>
      </div>

      <Modal
        title={activeCreateAction?.modalTitle ?? 'Tạo giao dịch'}
        open={Boolean(activeCreateSource)}
        onCancel={() => setActiveCreateSource(null)}
        footer={null}
        width={1040}
        destroyOnHidden
      >
        {renderCreateForm()}
      </Modal>
    </PageScaffold>
  );
}
