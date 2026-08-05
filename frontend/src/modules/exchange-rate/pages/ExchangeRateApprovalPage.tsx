// Flow 1 — Duyệt tỷ giá (nối API thật)
import { Alert, App, Button, Card, Form, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, HistoryOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatExchangeRate,
  formatTime,
} from '@/shared/utils/formatters';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import {
  useActiveRates, useApproveRate, useCreateRate, useCreateRateBatch, useExchangeRates, useParseRateImage, useRejectRate,
} from '../hooks/useExchangeRates';
import type { CreateRatePayload, ExchangeRateDto, ExchangeRateType, ParsedRateCandidate, RateStatus, ServiceProvider } from '../api/exchangeRate.api';

const RATE_TYPES: Array<{ value: ExchangeRateType; label: string }> = [
  { value: 'PAID_BUY', label: 'Paid mua' },
  { value: 'PAID_SELL', label: 'Paid bán' },
  { value: 'BANK_RATE', label: 'Tỷ giá ngân hàng' },
  { value: 'FX_BUY', label: 'Mua ngoại tệ' },
  { value: 'FX_SELL', label: 'Bán ngoại tệ' },
];
const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'SGD', 'AUD', 'CNY', 'KRW', 'THB', 'HKD', 'CAD', 'CHF', 'NZD', 'TWD', 'MYR', 'IDR', 'PHP', 'LAK', 'KHR'];

const STATUS_COLOR: Record<RateStatus, string> = {
  DRAFT: 'gold',
  ACTIVE: 'green',
  SUPERSEDED: 'default',
  REJECTED: 'red',
};

export function ExchangeRateApprovalPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = hasPermission(role, 'exchange_rate.manage');
  const canApprove = hasPermission(role, 'exchange_rate.approve');

  const { data: activeRates = [], isLoading: isLoadingActive } = useActiveRates();
  const { data: pendingRates = [], isLoading: isLoadingPending } = useExchangeRates({ status: 'DRAFT' });
  const createRate = useCreateRate();
  const approveRate = useApproveRate();
  const rejectRate = useRejectRate();
  const parseRateImage = useParseRateImage();
  const createRateBatch = useCreateRateBatch();
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);
  const [parsedRates, setParsedRates] = useState<ParsedRateCandidate[]>([]);
  const [form] = Form.useForm<CreateRatePayload>();
  const selectedRateType = Form.useWatch('rateType', form);
  const selectedProvider = selectedRateType ? normalizeRateProvider(selectedRateType) : undefined;

  const onCreate = async (values: CreateRatePayload) => {
    try {
      await createRate.mutateAsync({
        ...values,
        provider: normalizeRateProvider(values.rateType, values.provider),
        fromCurrency: normalizeFormCurrency(values.fromCurrency),
        toCurrency: 'VND',
      });
      message.success('Đã tạo tỷ giá thay thế (chờ duyệt)');
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

  const analyzeImage = async () => {
    const file = imageFiles[0]?.originFileObj;
    if (!file) return message.warning('Chọn một ảnh bảng tỷ giá');
    try {
      const result = await parseRateImage.mutateAsync(file as File);
      setParsedRates(result.rates);
      message.success(`Đã nhận dạng ${result.rates.length} tỷ giá`);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Không thể phân tích ảnh tỷ giá');
    }
  };

  const saveImageDrafts = async () => {
    if (parsedRates.length === 0) return;
    try {
      await createRateBatch.mutateAsync(parsedRates.map((rate) => ({
        rateType: rate.rateType,
        provider: providerForRateType(rate.rateType),
        fromCurrency: rate.fromCurrency,
        toCurrency: 'VND',
        rate: Number(rate.rate),
      })));
      message.success(`Đã tạo ${parsedRates.length} tỷ giá DRAFT chờ duyệt`);
      closeImageModal();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Không thể tạo danh sách tỷ giá chờ duyệt');
    }
  };

  const closeImageModal = () => {
    setImageModalOpen(false);
    setImageFiles([]);
    setParsedRates([]);
  };

  const updateParsedRate = (index: number, patch: Partial<ParsedRateCandidate>) => {
    setParsedRates((current) => current.map((rate, rateIndex) => rateIndex === index ? { ...rate, ...patch } : rate));
  };

  const activeColumns: ColumnsType<ExchangeRateDto> = [
    { title: 'Loại tỷ giá', dataIndex: 'rateType', render: (v, r) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{rateTypeLabel(v)}</Typography.Text>
        <Typography.Text type="secondary">{rateUsageLabel(v, r.provider)}</Typography.Text>
      </Space>
    ) },
    { title: 'Cặp tiền', render: (_, r) => `${r.fromCurrency}/${r.toCurrency}` },
    { title: 'Tỷ giá', dataIndex: 'rate', align: 'right',
      render: (v: number) => <Typography.Text strong>{formatExchangeRate(v)}</Typography.Text> },
    { title: 'Trạng thái', dataIndex: 'status', render: () => <Tag color="green">ACTIVE</Tag> },
    { title: 'Hiệu lực từ', dataIndex: 'effectiveFrom', render: (v: string) => formatTime(v) },
  ];

  const pendingColumns: ColumnsType<ExchangeRateDto> = [
    { title: 'Loại tỷ giá', dataIndex: 'rateType', render: (v, r) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{rateTypeLabel(v)}</Typography.Text>
        <Typography.Text type="secondary">{rateUsageLabel(v, r.provider)}</Typography.Text>
      </Space>
    ) },
    { title: 'Cặp tiền', render: (_, r) => `${r.fromCurrency}/${r.toCurrency}` },
    { title: 'Tỷ giá mới', dataIndex: 'rate', align: 'right',
      render: (v: number) => <Typography.Text strong>{formatExchangeRate(v)}</Typography.Text> },
    { title: 'Trạng thái', dataIndex: 'status',
      render: (s: RateStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: 'Tạo lúc', dataIndex: 'createdAt', render: (v: string) => formatTime(v) },
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
      description="Chọn loại tỷ giá và ngoại tệ. Nhóm áp dụng được hệ thống tự xác định, không cần chọn provider thủ công."
      moduleName="exchange-rate"
      extra={<Space wrap>
        {canManage && (
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setImageModalOpen(true)}>
            Nhập tỷ giá từ ảnh
          </Button>
        )}
        <Button icon={<HistoryOutlined />} onClick={() => navigate('/exchange-rate/history')}>Lịch sử tỷ giá</Button>
      </Space>}
    >
      {canManage && (
        <Card title="Tạo tỷ giá mới" size="small" className="mb-4">
          <Form form={form} layout="inline" onFinish={onCreate}>
            <Form.Item name="rateType" rules={[{ required: true }]}>
              <Select placeholder="Loại tỷ giá" style={{ width: 180 }}
                options={RATE_TYPES} />
            </Form.Item>
            <Tag className="mt-1! h-8 px-3! leading-8!">
              {selectedProvider ? `Nhóm: ${providerLabel(selectedProvider)}` : 'Nhóm tự động'}
            </Tag>
            <Form.Item name="fromCurrency" rules={[{ required: true }]}>
              <Select
                mode="tags"
                maxCount={1}
                placeholder="Ngoại tệ"
                style={{ width: 130 }}
                tokenSeparators={[',', ' ']}
                onChange={(values) => {
                  const value = normalizeCurrencyCode(values[values.length - 1]);
                  form.setFieldValue('fromCurrency', value ? [value] : []);
                }}
                options={CURRENCIES.map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="rate" rules={[{ required: true }]}>
              <InputNumber placeholder="Tỷ giá (VND)" min={0} style={{ width: 150 }}
                formatter={exchangeRateInputFormatter}
                parser={exchangeRateInputParser} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}
                loading={createRate.isPending}>Tạo (chờ duyệt)</Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      <Card title="Tỷ giá đang ACTIVE" size="small" className="mb-4">
        <Table<ExchangeRateDto>
          rowKey="id"
          loading={isLoadingActive}
          columns={activeColumns}
          dataSource={activeRates}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Card title="Tỷ giá thay thế chờ duyệt" size="small">
        <Table<ExchangeRateDto>
          rowKey="id"
          loading={isLoadingPending}
          columns={pendingColumns}
          dataSource={pendingRates}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <Modal
        title="Nhập bảng tỷ giá từ ảnh"
        width={980}
        open={imageModalOpen}
        onCancel={closeImageModal}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={closeImageModal}>Hủy</Button>,
          <Button key="analyze" icon={<UploadOutlined />} loading={parseRateImage.isPending}
            disabled={imageFiles.length === 0} onClick={analyzeImage}>Phân tích ảnh</Button>,
          <Button key="save" type="primary" loading={createRateBatch.isPending}
            disabled={parsedRates.length === 0} onClick={saveImageDrafts}>Tạo danh sách chờ duyệt</Button>,
        ]}
      >
        <Alert
          className="mb-4"
          showIcon
          type="warning"
          message="AI chỉ hỗ trợ nhận dạng"
          description="Kiểm tra loại tỷ giá, ngoại tệ và số tiền trước khi tạo DRAFT. Hệ thống không tự duyệt hoặc áp dụng kết quả từ ảnh."
        />
        <Upload.Dragger
          accept="image/jpeg,image/png,image/webp"
          maxCount={1}
          listType="picture"
          fileList={imageFiles}
          beforeUpload={(file) => {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
              message.error('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP');
              return Upload.LIST_IGNORE;
            }
            if (file.size > 10 * 1024 * 1024) {
              message.error('Ảnh không được vượt quá 10 MB');
              return Upload.LIST_IGNORE;
            }
            return false;
          }}
          onChange={({ fileList }) => {
            setImageFiles(fileList.slice(-1));
            setParsedRates([]);
          }}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="font-medium">Chọn hoặc kéo ảnh bảng tỷ giá vào đây</p>
          <Typography.Text type="secondary">JPEG, PNG, WebP · tối đa 10 MB</Typography.Text>
        </Upload.Dragger>

        {parsedRates.length > 0 && (
          <Table
            className="mt-4"
            rowKey={(_, index) => String(index)}
            pagination={false}
            scroll={{ x: 850 }}
            dataSource={parsedRates}
            columns={[
              { title: 'Loại', width: 165, render: (_, rate, index) => (
                <Select className="w-full" value={rate.rateType} options={RATE_TYPES}
                  onChange={(rateType) => updateParsedRate(index, { rateType, provider: providerForRateType(rateType) })} />
              ) },
              { title: 'Ngoại tệ', width: 105, render: (_, rate, index) => (
                <Select className="w-full" value={rate.fromCurrency} showSearch options={CURRENCIES.map((value) => ({ value }))}
                  onChange={(fromCurrency) => updateParsedRate(index, { fromCurrency })} />
              ) },
              { title: 'Tỷ giá', width: 170, render: (_, rate, index) => (
                <InputNumber className="w-full" min={0.000001} value={rate.rate}
                  formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser}
                  onChange={(value) => updateParsedRate(index, { rate: Number(value ?? 0) })} />
              ) },
              { title: 'Nguồn nhận dạng', dataIndex: 'sourceLabel', ellipsis: true,
                render: (value, rate) => <Space direction="vertical" size={0}>
                  <Typography.Text>{value || 'Không có nhãn'}</Typography.Text>
                  {rate.warning && <Typography.Text type="warning">{rate.warning}</Typography.Text>}
                </Space> },
              { title: 'Độ tin cậy', width: 110, align: 'center' as const,
                render: (_, rate) => <Tag color={rate.confidence >= 0.85 ? 'green' : rate.confidence >= 0.65 ? 'gold' : 'red'}>
                  {Math.round(rate.confidence * 100)}%
                </Tag> },
              { title: '', width: 50, render: (_, __, index) => (
                <Button type="text" danger icon={<DeleteOutlined />}
                  aria-label="Xóa tỷ giá" onClick={() => setParsedRates((current) => current.filter((_, i) => i !== index))} />
              ) },
            ]}
          />
        )}
      </Modal>
    </PageScaffold>
  );
}

function providerForRateType(rateType: ExchangeRateType): ServiceProvider {
  if (rateType === 'PAID_BUY' || rateType === 'PAID_SELL') return 'WU_MG';
  if (rateType === 'BANK_RATE') return 'BANK';
  return 'INTERNAL';
}

function normalizeCurrencyCode(value?: string) {
  return String(value ?? '').replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3);
}

function normalizeFormCurrency(value: string | string[]) {
  return normalizeCurrencyCode(Array.isArray(value) ? value[value.length - 1] : value);
}

function normalizeRateProvider(rateType: ExchangeRateType, provider?: ServiceProvider): ServiceProvider | undefined {
  if (
    rateType === 'PAID_BUY' ||
    rateType === 'PAID_SELL' ||
    rateType === 'WU_SYSTEM' ||
    rateType === 'WU_PROVIDER' ||
    rateType === 'MG_SYSTEM'
  ) {
    return 'WU_MG';
  }

  if (rateType === 'BANK_RATE') {
    return 'BANK';
  }

  if (rateType === 'FX_BUY' || rateType === 'FX_SELL') {
    return provider ?? 'INTERNAL';
  }

  return provider;
}

function providerLabel(provider: ServiceProvider) {
  if (provider === 'WU_MG') return 'WU/MG';
  if (provider === 'BANK') return 'Ngân hàng';
  if (provider === 'INTERNAL') return 'Nội bộ';
  return provider;
}

function rateTypeLabel(rateType: ExchangeRateType) {
  return RATE_TYPES.find((option) => option.value === rateType)?.label ?? rateType;
}

function rateUsageLabel(rateType: ExchangeRateType, provider?: ServiceProvider | null) {
  if (rateType === 'PAID_BUY') return 'WU/MG - khách nhận VND';
  if (rateType === 'PAID_SELL') return 'WU/MG - khách nhận USD';
  if (rateType === 'BANK_RATE') return 'Công nợ USD lẻ';
  if (rateType === 'FX_BUY') return 'Mua ngoại tệ từ khách';
  if (rateType === 'FX_SELL') return 'Bán ngoại tệ cho khách';
  return provider ? providerLabel(provider) : 'Nhóm tự động';
}
