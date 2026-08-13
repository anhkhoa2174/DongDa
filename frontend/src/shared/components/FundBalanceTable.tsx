import { Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getCurrencyMetadata } from '@/shared/constants/currencies';
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
  if (accountType === 'CASH') return { label: 'Quỹ gốc', color: 'gold' };
  if (accountType === 'FUND_A') return { label: 'Quỹ A', color: 'gold' };
  return { label: accountType, color: 'default' };
}

type GroupedFundBalanceTableItem = FundBalanceTableItem & {
  groupRowSpan: number;
};

const columns: ColumnsType<GroupedFundBalanceTableItem> = [
  {
    title: 'Loại tiền',
    dataIndex: 'currencyCode',
    width: 120,
    render: (value: string) => <span className="fund-balance-currency">{value}</span>,
  },
  {
    title: 'Quốc gia',
    dataIndex: 'currencyCode',
    width: 170,
    render: (value: string) => getCurrencyMetadata(value).country,
  },
  {
    title: 'Loại quỹ',
    dataIndex: 'accountType',
    width: 140,
    render: (value: string) => {
      const meta = accountTypeMeta(value);
      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
    onCell: (record) => ({ rowSpan: record.groupRowSpan }),
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
  const unifiedItems = [...items.reduce<Map<string, FundBalanceTableItem>>((result, item) => {
    const isPhysicalFund = item.accountType === 'CASH' || item.accountType === 'FUND_A';
    const key = isPhysicalFund ? `PHYSICAL:${item.currencyCode}` : item.key;
    const current = result.get(key);
    const isBaseCash = item.currencyCode === 'VND' || item.currencyCode === 'USD';
    result.set(key, {
      ...item,
      key,
      accountType: isPhysicalFund ? (isBaseCash ? 'CASH' : 'FUND_A') : item.accountType,
      accountName: isPhysicalFund
        ? (isBaseCash ? `Quỹ tiền mặt ${item.currencyCode}` : `Quỹ A ${item.currencyCode}`)
        : item.accountName,
      accountCode: isPhysicalFund
        ? `${isBaseCash ? 'CASH' : 'FUND_A'}_${item.currencyCode}`
        : item.accountCode,
      balance: (current?.balance ?? 0) + item.balance,
    });
    return result;
  }, new Map()).values()];
  const sortedItems = unifiedItems.sort((a, b) => {
    const groupOrder = (type: string) => type === 'CASH' ? 0 : type === 'FUND_A' ? 1 : 2;
    return groupOrder(a.accountType) - groupOrder(b.accountType)
      || a.accountType.localeCompare(b.accountType)
      || a.currencyCode.localeCompare(b.currencyCode);
  });
  const groupSizes = sortedItems.reduce<Record<string, number>>((sizes, item) => {
    sizes[item.accountType] = (sizes[item.accountType] ?? 0) + 1;
    return sizes;
  }, {});
  const seenGroups = new Set<string>();
  const groupedItems: GroupedFundBalanceTableItem[] = sortedItems.map((item) => {
    const isFirst = !seenGroups.has(item.accountType);
    seenGroups.add(item.accountType);
    return { ...item, groupRowSpan: isFirst ? groupSizes[item.accountType] : 0 };
  });

  return (
    <Table<GroupedFundBalanceTableItem>
      className="fund-balance-table"
      rowKey="key"
      loading={loading}
      columns={columns}
      dataSource={groupedItems}
      pagination={false}
      rowClassName={(record) => record.balance < 0 ? 'fund-balance-row--negative' : ''}
      scroll={{ x: 900, ...(scrollY ? { y: scrollY } : {}) }}
      locale={{ emptyText }}
    />
  );
}
