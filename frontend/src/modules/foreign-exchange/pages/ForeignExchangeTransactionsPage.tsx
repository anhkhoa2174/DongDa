import { Alert, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  TransactionWorkspacePage,
  type TransactionField,
} from '@/modules/transactions/components/TransactionWorkspacePage';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';
import { foreignExchangeTransactionsMock } from '../data/transactions.mock';

const fields: TransactionField[] = [
  {
    name: 'transactionType',
    label: 'Nghiệp vụ',
    kind: 'select',
    required: true,
    options: [
      { value: 'BUY', label: 'Mua - khách bán ngoại tệ' },
      { value: 'SELL', label: 'Bán - khách mua ngoại tệ' },
    ],
  },
  {
    name: 'currency',
    label: 'Ngoại tệ',
    kind: 'select',
    required: true,
    options: ['EUR', 'AUD', 'JPY', 'GBP', 'SGD', 'KRW', 'THB', 'HKD', 'CNY'].map((value) => ({ value, label: value })),
  },
  { name: 'customerName', label: 'Tên khách hàng', kind: 'text', required: true },
  { name: 'foreignAmount', label: 'Số lượng ngoại tệ', kind: 'number', required: true, precision: 2 },
  { name: 'rate', label: 'Tỷ giá áp dụng', kind: 'number', required: true, precision: 2 },
  { name: 'vndAmount', label: 'Thành tiền VND', kind: 'number', required: true },
];

const columns: ColumnsType<TransactionRecord> = [
  {
    title: 'Nghiệp vụ',
    dataIndex: 'transactionType',
    render: (value: string) => <Tag color={value === 'BUY' ? 'green' : 'volcano'}>{value === 'BUY' ? 'Mua' : 'Bán'}</Tag>,
  },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'Ngoại tệ', dataIndex: 'currency' },
  {
    title: 'Số lượng',
    dataIndex: 'foreignAmount',
    align: 'right',
    render: (value: number, record) => `${record.currency} ${Number(value).toLocaleString('vi-VN')}`,
  },
  { title: 'Tỷ giá', dataIndex: 'rate', align: 'right', render: (value: number) => Number(value).toLocaleString('vi-VN') },
  { title: 'Thành tiền', dataIndex: 'vndAmount', align: 'right', render: (value: number) => `${Number(value).toLocaleString('vi-VN')} ₫` },
];

type ForeignExchangeTransactionsPageProps = {
  createOnly?: boolean;
  onCreated?: () => void;
};

export function ForeignExchangeTransactionsPage({ createOnly, onCreated }: ForeignExchangeTransactionsPageProps = {}) {
  return (
    <TransactionWorkspacePage
      title="Mua Bán Ngoại Tệ"
      description="Ghi nhận khách bán/mua ngoại tệ và cập nhật tồn Quỹ A theo từng loại tiền."
      moduleName="foreign-exchange"
      codePrefix="FX"
      createLabel="Tạo giao dịch ngoại tệ"
      fields={fields}
      columns={columns}
      initialRecords={foreignExchangeTransactionsMock}
      createOnly={createOnly}
      onCreated={onCreated}
      formNotice={<Alert className="mb-4" type="info" showIcon message="Tỷ giá phải nằm trong biên độ được GĐ/KTTH phê duyệt." />}
    />
  );
}
