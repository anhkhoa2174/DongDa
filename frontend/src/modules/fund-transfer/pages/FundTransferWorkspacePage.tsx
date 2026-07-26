// Flow 3 — Tiếp quỹ / Điều chuyển vốn (nối API thật, xác nhận 2 chiều)
import { App, Button, Card, Col, Form, InputNumber, Popconfirm, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseOutlined, SendOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  useBranches, useConfirmTransfer, useCreateTransfer, useFundBalances, useFundTransfers, useRejectTransfer,
} from '../hooks/useFundTransfers';
import type { FundBalanceDto, FundTransferDto, FundTransferStatus } from '../api/fundTransfer.api';

const money = (n: number) => n.toLocaleString('vi-VN');

const STATUS: Record<FundTransferStatus, { color: string; label: string }> = {
  PENDING_APPROVAL: { color: 'gold', label: 'Chờ xác nhận' },
  CONFIRMED: { color: 'green', label: 'Đã nhận' },
  REJECTED: { color: 'red', label: 'Từ chối' },
  CANCELLED: { color: 'default', label: 'Đã hủy' },
};

export function FundTransferWorkspacePage() {
  const { message } = App.useApp();
  const { data: transfers = [], isLoading } = useFundTransfers();
  const { data: balances = [] } = useFundBalances();
  const { data: branches = [] } = useBranches();
  const create = useCreateTransfer();
  const confirm = useConfirmTransfer();
  const reject = useRejectTransfer();
  const [form] = Form.useForm();

  const branchName = (id: string) => branches.find((b) => b.id === id)?.code ?? id.slice(0, 6);

  const onCreate = async (v: any) => {
    try {
      await create.mutateAsync(v);
      message.success('Đã tạo phiếu điều chuyển (chờ bên nhận xác nhận)');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Tạo phiếu thất bại');
    }
  };
  const act = async (fn: Promise<any>, ok: string) => {
    try { await fn; message.success(ok); }
    catch (e: any) { message.error(e?.response?.data?.message ?? 'Thất bại'); }
  };

  const balCols: ColumnsType<FundBalanceDto> = [
    { title: 'Chi nhánh', dataIndex: 'branchId', render: branchName },
    { title: 'Sổ quỹ', dataIndex: 'name' },
    { title: 'Loại tiền', dataIndex: 'currencyCode' },
    { title: 'Số dư', dataIndex: 'balance', align: 'right',
      render: (v, r) => <Typography.Text strong>{money(v)} {r.currencyCode}</Typography.Text> },
  ];

  const txCols: ColumnsType<FundTransferDto> = [
    { title: 'Mã phiếu', dataIndex: 'transferNo' },
    { title: 'Gửi', dataIndex: 'sourceBranchId', render: branchName },
    { title: 'Nhận', dataIndex: 'destinationBranchId', render: branchName },
    { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v, r) => `${money(v)} ${r.currencyCode}` },
    { title: 'Trạng thái', dataIndex: 'status', render: (s: FundTransferStatus) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag> },
    {
      title: 'Thao tác (bên nhận)', key: 'a', fixed: 'right',
      render: (_, r) => r.status === 'PENDING_APPROVAL' ? (
        <Space>
          <Popconfirm title="Xác nhận đã nhận đủ tiền?" onConfirm={() => act(confirm.mutateAsync(r.id), 'Đã xác nhận — số dư đã chuyển')}>
            <Button type="primary" size="small" icon={<CheckOutlined />}>Xác nhận</Button>
          </Popconfirm>
          <Popconfirm title="Từ chối nhận?" onConfirm={() => act(reject.mutateAsync(r.id), 'Đã từ chối')}>
            <Button danger size="small" icon={<CloseOutlined />}>Từ chối</Button>
          </Popconfirm>
        </Space>
      ) : <Typography.Text type="secondary">—</Typography.Text>,
    },
  ];

  return (
    <PageScaffold
      title="Tiếp quỹ / Điều chuyển vốn"
      description="Bên gửi tạo phiếu → bên nhận xác nhận thì số dư mới chuyển (xác nhận 2 chiều)."
      moduleName="fund-transfer"
    >
      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="Tạo phiếu điều chuyển" size="small" className="mb-4">
            <Form form={form} layout="vertical" onFinish={onCreate}>
              <Form.Item name="sourceBranchId" label="Chi nhánh GỬI" rules={[{ required: true }]}>
                <Select placeholder="Chọn CN gửi"
                  options={branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
              </Form.Item>
              <Form.Item name="destinationBranchId" label="Chi nhánh NHẬN" rules={[{ required: true }]}>
                <Select placeholder="Chọn CN nhận"
                  options={branches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))} />
              </Form.Item>
              <Form.Item name="currencyCode" label="Loại tiền" rules={[{ required: true }]} initialValue="VND">
                <Select options={['VND', 'USD'].map((v) => ({ value: v, label: v }))} />
              </Form.Item>
              <Form.Item name="amount" label="Số tiền" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={create.isPending} block>
                Gửi phiếu (chờ xác nhận)
              </Button>
            </Form>
          </Card>
          <Card title="Số dư quỹ các chi nhánh" size="small">
            <Table<FundBalanceDto> rowKey="id" size="small" columns={balCols} dataSource={balances}
              pagination={false} scroll={{ y: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Phiếu điều chuyển" size="small">
            <Table<FundTransferDto> rowKey="id" loading={isLoading} columns={txCols} dataSource={transfers}
              scroll={{ x: 700 }} pagination={{ pageSize: 10 }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
