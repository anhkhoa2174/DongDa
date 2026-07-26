// Flow 1 — Duyệt tỷ giá (nối API thật)
import { App, Button, Card, Form, InputNumber, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatExchangeRate, formatTime } from '@/shared/utils/formatters';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import {
  useApproveRate, useCreateRate, useExchangeRates, useRejectRate,
} from '../hooks/useExchangeRates';
import type { CreateRatePayload, ExchangeRateDto, RateStatus } from '../api/exchangeRate.api';

const RATE_TYPES = ['PAID_BUY', 'PAID_SELL', 'WU_SYSTEM', 'MG_SYSTEM', 'FX_BUY', 'FX_SELL'];
const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'SGD', 'AUD', 'CNY', 'KRW', 'THB', 'HKD'];

const STATUS_COLOR: Record<RateStatus, string> = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  SUPERSEDED: 'default',
  REJECTED: 'red',
};

export function ExchangeRateApprovalPage() {
  const { message } = App.useApp();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = hasPermission(role, 'exchange_rate.manage');
  const canApprove = hasPermission(role, 'exchange_rate.approve');

  const { data: rates = [], isLoading } = useExchangeRates();
  const createRate = useCreateRate();
  const approveRate = useApproveRate();
  const rejectRate = useRejectRate();
  const [form] = Form.useForm<CreateRatePayload>();

  const onCreate = async (values: CreateRatePayload) => {
    try {
      await createRate.mutateAsync({ ...values, toCurrency: 'VND' });
      message.success('Đã tạo tỷ giá (chờ duyệt)');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Tạo tỷ giá thất bại');
    }
  };

  const onApprove = async (id: string) => {
    try {
      await approveRate.mutateAsync(id);
      message.success('Đã duyệt — tỷ giá ACTIVE, bản cũ đã bị thay');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Duyệt thất bại');
    }
  };

  const onReject = async (id: string) => {
    try {
      await rejectRate.mutateAsync(id);
      message.success('Đã từ chối tỷ giá');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Từ chối thất bại');
    }
  };

  const columns: ColumnsType<ExchangeRateDto> = [
    { title: 'Loại tỷ giá', dataIndex: 'rateType', render: (v, r) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{v}</Typography.Text>
        {r.provider && <Typography.Text type="secondary">{r.provider}</Typography.Text>}
      </Space>
    ) },
    { title: 'Cặp tiền', render: (_, r) => `${r.fromCurrency}/${r.toCurrency}` },
    { title: 'Tỷ giá', dataIndex: 'rate', align: 'right',
      render: (v: number) => <Typography.Text strong>{formatExchangeRate(v)}</Typography.Text> },
    { title: 'Trạng thái', dataIndex: 'status',
      render: (s: RateStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: 'Hiệu lực từ', dataIndex: 'effectiveFrom', render: (v: string) => formatTime(v) },
    {
      title: 'Thao tác', key: 'action', fixed: 'right',
      render: (_, r) =>
        r.status === 'DRAFT' && canApprove ? (
          <Space>
            <Popconfirm title="Duyệt tỷ giá này?" onConfirm={() => onApprove(r.id)}>
              <Button type="primary" size="small" icon={<CheckOutlined />}>Duyệt</Button>
            </Popconfirm>
            <Popconfirm title="Từ chối tỷ giá này?" onConfirm={() => onReject(r.id)}>
              <Button danger size="small" icon={<CloseOutlined />}>Từ chối</Button>
            </Popconfirm>
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ];

  return (
    <PageScaffold
      title="Duyệt tỷ giá"
      description="Tạo tỷ giá mới (DRAFT) → duyệt để ACTIVE. Chỉ 1 tỷ giá active cho mỗi loại + cặp tiền."
      moduleName="exchange-rate"
    >
      {canManage && (
        <Card title="Tạo tỷ giá mới" size="small" className="mb-4">
          <Form form={form} layout="inline" onFinish={onCreate}>
            <Form.Item name="rateType" rules={[{ required: true }]}>
              <Select placeholder="Loại tỷ giá" style={{ width: 160 }}
                options={RATE_TYPES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="provider">
              <Select placeholder="Provider" allowClear style={{ width: 110 }}
                options={['WU', 'MG'].map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="fromCurrency" rules={[{ required: true }]}>
              <Select placeholder="Ngoại tệ" style={{ width: 110 }}
                options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="rate" rules={[{ required: true }]}>
              <InputNumber placeholder="Tỷ giá (VND)" min={0} style={{ width: 150 }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}
                loading={createRate.isPending}>Tạo (chờ duyệt)</Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      <Card size="small">
        <Table<ExchangeRateDto>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={rates}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </PageScaffold>
  );
}
