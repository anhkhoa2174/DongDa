import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  BankOutlined,
  DownloadOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
  formatUsd,
  formatVnd,
} from '@/shared/utils/formatters';
import { useBankMovementsView } from '../hooks/useBankMovementsView';
import type { BankAccount, BankBalanceMovement, BankBalanceMovementType } from '../model/bank.types';

const movementMeta: Record<BankBalanceMovementType, { label: string; color: string }> = {
  DEPOSIT: { label: 'Nạp tiền', color: 'green' },
  WITHDRAW: { label: 'Chi tiền', color: 'red' },
  TRANSFER_IN: { label: 'Chuyển vào', color: 'cyan' },
  TRANSFER_OUT: { label: 'Chuyển ra', color: 'orange' },
  RECONCILIATION: { label: 'Đối chiếu', color: 'gold' },
};

function formatAccountMoney(account: BankAccount, value: number) {
  return account.currency === 'VND' ? formatVnd(value) : formatUsd(value);
}

export function BankAccountMovementsPage() {
  const { accountKey } = useParams();
  const navigate = useNavigate();
  const [operation, setOperation] = useState<'deposit' | 'withdraw' | null>(null);
  const { account, movements } = useBankMovementsView(accountKey);

  if (!account) {
    return (
      <PageScaffold title="Lịch sử biến động" description="Theo dõi biến động số dư của từng tài khoản ngân hàng." moduleName="bank-management">
        <Card>
          <Empty description="Không tìm thấy tài khoản ngân hàng" />
          <Button className="mt-4" icon={<ArrowLeftOutlined />} onClick={() => navigate('/bank-management/accounts')}>
            Quay lại danh sách
          </Button>
        </Card>
      </PageScaffold>
    );
  }

  const columns: ColumnsType<BankBalanceMovement> = [
    {
      title: 'Thời gian',
      dataIndex: 'occurredAt',
      fixed: 'left',
      width: 150,
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      render: (value: BankBalanceMovementType) => <Tag color={movementMeta[value].color}>{movementMeta[value].label}</Tag>,
    },
    {
      title: 'Nội dung',
      dataIndex: 'description',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">{record.referenceCode} · {record.counterparty}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      align: 'right',
      render: (value: number) => (
        <Typography.Text strong className={value >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
          {formatAccountMoney(account, value)}
        </Typography.Text>
      ),
    },
    { title: 'Số dư trước', dataIndex: 'balanceBefore', align: 'right', render: (value: number) => formatAccountMoney(account, value) },
    { title: 'Số dư sau', dataIndex: 'balanceAfter', align: 'right', render: (value: number) => formatAccountMoney(account, value) },
    { title: 'Người tạo', dataIndex: 'createdBy' },
  ];

  return (
    <PageScaffold
      title="Lịch sử biến động"
      description="Theo dõi biến động số dư của từng tài khoản ngân hàng."
      moduleName="bank-management"
      extra={(
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/bank-management/accounts')}>Danh sách tài khoản</Button>
          <Button icon={<DownloadOutlined />}>Xuất sao kê</Button>
          <Button icon={<ArrowDownOutlined />} onClick={() => setOperation('deposit')}>Nạp tiền</Button>
          <Button danger icon={<ArrowUpOutlined />} onClick={() => setOperation('withdraw')}>Chi tiền</Button>
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
                  {account.bankName} · STK {account.accountNumber} · {account.currency}
                </Typography.Text>
              </div>
            </div>
            <Tag color="cyan" className="m-0!">{account.ownerScope}</Tag>
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic title="Số dư hiện tại" value={account.balance} formatter={(value) => formatAccountMoney(account, Number(value))} />
            </Col>
            <Col xs={24} md={8}>
              <Statistic title="Số dư khả dụng" value={account.availableBalance} formatter={(value) => formatAccountMoney(account, Number(value))} />
            </Col>
            <Col xs={24} md={8}>
              <Statistic title="Biến động hôm nay" value={account.transactionCountToday} suffix="GD" prefix={<SwapOutlined />} />
            </Col>
          </Row>
        </Card>

        <Card title="Lịch sử biến động số dư" className="polished-card">
          <Table columns={columns} dataSource={movements} rowKey="key" scroll={{ x: 1100 }} pagination={false} />
        </Card>
      </Space>

      <Modal
        title={operation === 'deposit' ? 'Nạp tiền vào tài khoản' : 'Chi tiền ra khỏi tài khoản'}
        open={operation !== null}
        okText={operation === 'deposit' ? 'Xác nhận nạp' : 'Xác nhận chi'}
        cancelText="Hủy"
        onCancel={() => setOperation(null)}
        onOk={() => setOperation(null)}
      >
        <Form layout="vertical">
          <Form.Item label="Tài khoản">
            <Input value={`${account.bankCode} · ${account.accountNumber}`} disabled />
          </Form.Item>
          <Form.Item label={`Số tiền ${account.currency}`}>
            <InputNumber
              className="w-full"
              min={0}
              precision={account.currency === 'VND' ? 0 : 2}
              formatter={account.currency === 'VND' ? numberInputFormatter : usdInputFormatter}
              parser={account.currency === 'VND' ? numberInputParser : usdInputParser}
              addonAfter={account.currency}
            />
          </Form.Item>
          <Form.Item label="Nội dung">
            <Input.TextArea rows={3} placeholder={operation === 'deposit' ? 'Nhập nội dung nạp tiền' : 'Nhập nội dung chi tiền'} />
          </Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  );
}
