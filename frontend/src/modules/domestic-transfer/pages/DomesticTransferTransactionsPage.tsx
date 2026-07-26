import { Alert, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  TransactionWorkspacePage,
  type TransactionField,
} from '@/modules/transactions/components/TransactionWorkspacePage';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';
import { formatVnd } from '@/shared/utils/formatters';
import { domesticTransferTransactionsMock } from '../data/transactions.mock';

const fields: TransactionField[] = [
  {
    name: 'transactionType',
    label: 'Loại giao dịch',
    kind: 'select',
    required: true,
    options: [
      { value: 'OUTGOING', label: 'Chuyển tiền đi - nhận tiền mặt' },
      { value: 'INCOMING', label: 'Nhận tiền - chi tiền mặt' },
    ],
  },
  { name: 'customerName', label: 'Tên khách hàng', kind: 'text', required: true },
  { name: 'phone', label: 'Số điện thoại', kind: 'text', required: true },
  { name: 'bank', label: 'Ngân hàng', kind: 'text', required: true },
  { name: 'accountNumber', label: 'Số tài khoản', kind: 'text', required: true },
  { name: 'amount', label: 'Số tiền', kind: 'number', required: true },
  { name: 'fee', label: 'Phí giao dịch', kind: 'number', required: true },
  { name: 'vndAmount', label: 'Tổng giá trị VND', kind: 'number', required: true },
];

const columns: ColumnsType<TransactionRecord> = [
  {
    title: 'Loại GD',
    dataIndex: 'transactionType',
    render: (value: string) => <Tag color={value === 'OUTGOING' ? 'blue' : 'purple'}>{value === 'OUTGOING' ? 'Chuyển đi' : 'Nhận tiền'}</Tag>,
  },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'Ngân hàng', dataIndex: 'bank' },
  { title: 'Số tài khoản', dataIndex: 'accountNumber' },
  { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (value: number) => formatVnd(Number(value)) },
  { title: 'Phí', dataIndex: 'fee', align: 'right', render: (value: number) => formatVnd(Number(value)) },
];

type DomesticTransferTransactionsPageProps = {
  createOnly?: boolean;
  onCreated?: () => void;
};

export function DomesticTransferTransactionsPage({ createOnly, onCreated }: DomesticTransferTransactionsPageProps = {}) {
  return (
    <TransactionWorkspacePage
      title="Chuyển Tiền Nội Địa"
      description="Quản lý chuyển tiền đi, nhận tiền và phí giao dịch theo ca làm việc."
      moduleName="domestic-transfer"
      codePrefix="DT"
      createLabel="Tạo giao dịch chuyển tiền"
      fields={fields}
      columns={columns}
      initialRecords={domesticTransferTransactionsMock}
      createOnly={createOnly}
      onCreated={onCreated}
      formNotice={<Alert className="mb-4" type="info" showIcon message="Phí được kiểm soát theo cấu hình cố định, %, min, max hoặc miễn phí." />}
    />
  );
}
