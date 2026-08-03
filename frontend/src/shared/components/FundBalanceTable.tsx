import { Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatCurrency } from '@/shared/utils/formatters';

export type FundBalanceTableItem = {
  key: string;
  currencyCode: string;
  accountType: string;
  accountName: string;
  accountCode?: string;
  balance: number;
};

type FundBalanceTableProps = {
  items: FundBalanceTableItem[];
  loading?: boolean;
  emptyText?: string;
  scrollY?: number;
};

function accountTypeMeta(accountType: string) {
  if (accountType === 'CASH') return { label: 'Tiền mặt', color: 'green' };
  if (accountType === 'FUND_A') return { label: 'Quỹ A', color: 'gold' };
  return { label: accountType, color: 'default' };
}

const columns: ColumnsType<FundBalanceTableItem> = [
  {
    title: 'Loại tiền',
    dataIndex: 'currencyCode',
    width: 120,
    render: (value: string) => <span className="fund-balance-currency">{value}</span>,
  },
  {
    title: 'Loại quỹ',
    dataIndex: 'accountType',
    width: 140,
    render: (value: string) => {
      const meta = accountTypeMeta(value);
      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
  },
  {
    title: 'Tài khoản quỹ',
    dataIndex: 'accountName',
    render: (value: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{value}</Typography.Text>
        {record.accountCode && (
          <Typography.Text type="secondary" className="text-xs!">{record.accountCode}</Typography.Text>
        )}
      </Space>
    ),
  },
  {
    title: 'Số dư hiện tại',
    dataIndex: 'balance',
    align: 'right',
    width: 190,
    render: (value: number, record) => (
      <Typography.Text strong>{formatCurrency(value, record.currencyCode)}</Typography.Text>
    ),
  },
];

export function FundBalanceTable({
  items,
  loading = false,
  emptyText = 'Chưa có số dư quỹ',
  scrollY,
}: FundBalanceTableProps) {
  return (
    <Table<FundBalanceTableItem>
      className="fund-balance-table"
      rowKey="key"
      loading={loading}
      columns={columns}
      dataSource={items}
      pagination={false}
      rowClassName={(record) => record.balance < 0 ? 'fund-balance-row--negative' : ''}
      scroll={{ x: 720, ...(scrollY ? { y: scrollY } : {}) }}
      locale={{ emptyText }}
    />
  );
}
