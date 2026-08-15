// Flow 1 — Duyệt tỷ giá (nối API thật)
import { Alert, App, Button, Card, Col, Form, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, HistoryOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { CURRENCIES, currencyOptions, getCurrencyMetadata } from '@/shared/constants/currencies';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatExchangeRate,
  formatTime,
} from '@/shared/utils/formatters';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import {
  useActiveRates, useApproveRate, useCreateRateBatch, useExchangeRates, useParseRateImage, useRejectRate,
} from '../hooks/useExchangeRates';
import type { CreateRatePayload, ExchangeRateDto, ExchangeRateType, ParsedRateCandidate, RateStatus, ServiceProvider } from '../api/exchangeRate.api';

const RATE_TYPES: Array<{ value: ExchangeRateType; label: string }> = [
  { value: 'PAID_BUY', label: 'Tỷ giá Paid - Mua' },
  { value: 'PAID_SELL', label: 'Tỷ giá Paid - Bán' },
  { value: 'BANK_RATE', label: 'Tỷ giá ngân hàng' },
  { value: 'FX_BUY', label: 'Tỷ giá mua/bán - Mua' },
  { value: 'FX_SELL', label: 'Tỷ giá mua/bán - Bán' },
];
const RATE_CATEGORIES = [
  { value: 'PAID', label: 'Tỷ giá Paid' },
  { value: 'FX', label: 'Tỷ giá mua/bán' },
  { value: 'BANK', label: 'Tỷ giá Ngân hàng' },
] as const;
const RATE_CURRENCY_OPTIONS = currencyOptions.filter((currency) => currency.value !== 'VND');

type RateCategory = typeof RATE_CATEGORIES[number]['value'];
type CreateRateEntry = {
  category: RateCategory;
  fromCurrency: string;
  buyRate?: number;
  sellRate?: number;
  margin?: number;
};
type CreateRatesForm = { rates: CreateRateEntry[] };
const EMPTY_RATE: CreateRateEntry = {
  category: 'FX',
  fromCurrency: 'USD',
  buyRate: 0,
  sellRate: 0,
  margin: 0,
};

type PairedRateRow = {
  key: string;
  category: RateCategory;
  fromCurrency: string;
  buy?: ExchangeRateDto;
  sell?: ExchangeRateDto;
  bank?: ExchangeRateDto;
};

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
  const approveRate = useApproveRate();
  const rejectRate = useRejectRate();
  const parseRateImage = useParseRateImage();
  const createRateBatch = useCreateRateBatch();
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([]);
  const [parsedRates, setParsedRates] = useState<ParsedRateCandidate[]>([]);
  const [form] = Form.useForm<CreateRatesForm>();
  const watchedRates = Form.useWatch('rates', form) ?? [];

  const onCreate = async (values: CreateRatesForm) => {
    const identities = values.rates.map((rate) => `${rate.category}:${normalizeCurrencyCode(rate.fromCurrency)}`);
    if (new Set(identities).size !== identities.length) {
      message.error('Mỗi loại tỷ giá và ngoại tệ chỉ được thêm một lần trong danh sách');
      return;
    }

    const payloads = values.rates.flatMap<CreateRatePayload>((entry) => {
      const fromCurrency = entry.category === 'FX' ? normalizeCurrencyCode(entry.fromCurrency) : 'USD';
      if (entry.category === 'PAID') {
        return [
          buildRatePayload('PAID_BUY', fromCurrency, Number(entry.buyRate), 0),
          buildRatePayload('PAID_SELL', fromCurrency, Number(entry.sellRate), 0),
        ];
      }
      if (entry.category === 'FX') {
        const margin = Number(entry.margin ?? 0);
        return [
          buildRatePayload('FX_BUY', fromCurrency, Number(entry.buyRate), margin),
          buildRatePayload('FX_SELL', fromCurrency, Number(entry.sellRate), margin),
        ];
      }
      return [{
        ...buildRatePayload('BANK_RATE', fromCurrency, Number(entry.buyRate), 0),
        buyRate: Number(entry.buyRate),
        sellRate: Number(entry.sellRate),
      }];
    });

    try {
      await createRateBatch.mutateAsync(payloads);
      message.success(`Đã tạo ${values.rates.length} dòng tỷ giá chờ duyệt`);
      form.setFieldsValue({ rates: [{ ...EMPTY_RATE }] });
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Tạo danh sách tỷ giá thất bại'));
    }
  };

  const onApprove = async (id: string) => {
    try {
      await approveRate.mutateAsync(id);
      message.success('Đã duyệt — tỷ giá ACTIVE, bản cũ đã bị thay');
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Duyệt thất bại'));
    }
  };

  const onReject = async (id: string) => {
    try {
      await rejectRate.mutateAsync(id);
      message.success('Đã từ chối tỷ giá');
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Từ chối thất bại'));
    }
  };

  const analyzeImage = async () => {
    const file = imageFiles[0]?.originFileObj;
    if (!file) return message.warning('Chọn một ảnh bảng tỷ giá');
    try {
      const result = await parseRateImage.mutateAsync(file as File);
      setParsedRates(result.rates);
      message.success(`Đã nhận dạng ${result.rates.length} tỷ giá`);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Không thể phân tích ảnh tỷ giá'));
    }
  };

  const saveImageDrafts = async () => {
    if (parsedRates.length === 0) return;
    if (parsedRates.some((rate) => rate.rateType === 'BANK_RATE' && (!(rate.buyRate ?? rate.rate) || !rate.sellRate))) {
      message.error('Tỷ giá Ngân hàng phải có đủ giá mua và giá bán');
      return;
    }
    try {
      await createRateBatch.mutateAsync(parsedRates.map((rate) => ({
        rateType: rate.rateType,
        provider: providerForRateType(rate.rateType),
        fromCurrency: rate.fromCurrency,
        toCurrency: 'VND',
        rate: Number(rate.rate),
        margin: rate.rateType === 'FX_BUY' || rate.rateType === 'FX_SELL' ? Number(rate.margin ?? 0) : 0,
        buyRate: rate.buyRate,
        sellRate: rate.sellRate,
      })));
      message.success(`Đã tạo ${parsedRates.length} tỷ giá DRAFT chờ duyệt`);
      closeImageModal();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Không thể tạo danh sách tỷ giá chờ duyệt'));
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

  const activeRows = pairRates(activeRates);
  const pendingRows = pairRates(pendingRates);

  const pairedColumns: ColumnsType<PairedRateRow> = [
    {
      title: 'Loại tỷ giá',
      dataIndex: 'category',
      width: 150,
      render: (value: RateCategory) => <Typography.Text strong>{rateCategoryLabel(value)}</Typography.Text>,
    },
    {
      title: 'Ngoại tệ',
      dataIndex: 'fromCurrency',
      width: 120,
      render: (value: string) => (
        <Space direction="vertical" size={0}>
          <Typography.Text className="exchange-rate-code">{value}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">{getCurrencyMetadata(value).name}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Quốc gia',
      dataIndex: 'fromCurrency',
      width: 145,
      responsive: ['lg'],
      render: (value: string) => getCurrencyMetadata(value).country,
    },
    { title: 'Giá mua', key: 'buyRate', align: 'right', width: 145, render: (_, row) => renderRowRate(row, 'buy') },
    { title: 'Giá bán', key: 'sellRate', align: 'right', width: 145, render: (_, row) => renderRowRate(row, 'sell') },
    {
      title: 'Biên độ',
      key: 'margin',
      align: 'right',
      width: 120,
      render: (_, row) => formatExchangeRate(rateMargin(row), 6),
    },
    {
      title: 'Hiệu lực',
      key: 'effectiveFrom',
      align: 'right',
      width: 90,
      responsive: ['xl'],
      render: (_, row) => formatTime(latestRate(row)?.effectiveFrom),
    },
  ];

  const renderPendingActions = (row: PairedRateRow) => {
    const rates = [
      row.buy && { label: 'Mua', rate: row.buy },
      row.sell && { label: 'Bán', rate: row.sell },
      row.bank && { label: 'Ngân hàng', rate: row.bank },
    ].filter(Boolean) as Array<{ label: string; rate: ExchangeRateDto }>;
    if (!canApprove || rates.length === 0) return <Typography.Text type="secondary">—</Typography.Text>;

    return (
      <Space direction="vertical" size={4}>
        {rates.map(({ label, rate }) => (
          <Space key={rate.id} size={2}>
            <Typography.Text className="w-11 text-xs!" type="secondary">{label}</Typography.Text>
            <Popconfirm title={`Duyệt giá ${label.toLowerCase()}?`} onConfirm={() => onApprove(rate.id)}>
              <Tooltip title={`Duyệt giá ${label.toLowerCase()}`}><Button type="primary" size="small" aria-label={`Duyệt giá ${label}`} icon={<CheckOutlined />} /></Tooltip>
            </Popconfirm>
            <Popconfirm title={`Từ chối giá ${label.toLowerCase()}?`} onConfirm={() => onReject(rate.id)}>
              <Tooltip title={`Từ chối giá ${label.toLowerCase()}`}><Button danger size="small" aria-label={`Từ chối giá ${label}`} icon={<CloseOutlined />} /></Tooltip>
            </Popconfirm>
          </Space>
        ))}
      </Space>
    );
  };

  const pendingColumns: ColumnsType<PairedRateRow> = [
    ...pairedColumns.slice(0, 6),
    {
      title: 'Trạng thái',
      key: 'status',
      width: 92,
      responsive: ['lg'],
      render: () => <Tag color={STATUS_COLOR.DRAFT}>DRAFT</Tag>,
    },
    { title: 'Thao tác', key: 'action', fixed: 'right', width: 125, render: (_, row) => renderPendingActions(row) },
  ];

  return (
    <PageScaffold
      title="Duyệt tỷ giá"
      description="Quản lý theo ba nhóm: tỷ giá Paid, tỷ giá mua/bán ngoại tệ và tỷ giá Ngân hàng. Giá mua và bán được tạo, đối chiếu theo cặp."
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
        <Card title="Tạo danh sách tỷ giá" size="small" className="mb-4" extra={<Tag color="gold">Tạo hàng loạt</Tag>}>
          <Form form={form} layout="vertical" initialValues={{ rates: [{ ...EMPTY_RATE }] }} onFinish={onCreate}>
            <Form.List name="rates">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} className="w-full">
                  {fields.map((field, index) => (
                    <div key={field.key} className="fund-transfer-line exchange-rate-entry w-full">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <Space size={10}>
                          <span className="exchange-rate-entry__number">{String(index + 1).padStart(2, '0')}</span>
                          <div>
                            <Typography.Text strong>Tỷ giá {index + 1}</Typography.Text>
                            <Typography.Text type="secondary" className="block text-xs!">
                              {watchedRates[index]?.category ? rateCategoryDescription(watchedRates[index].category) : 'Chọn nghiệp vụ áp dụng'}
                            </Typography.Text>
                          </div>
                        </Space>
                        <Button type="text" danger icon={<DeleteOutlined />} title="Xóa tỷ giá"
                          disabled={fields.length === 1} onClick={() => remove(field.name)} />
                      </div>
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={5}>
                          <Form.Item {...field} name={[field.name, 'category']} label="Loại tỷ giá" className="mb-0"
                            rules={[{ required: true, message: 'Chọn loại tỷ giá' }]}>
                            <Select
                              size="large"
                              options={[...RATE_CATEGORIES]}
                              onChange={(category: RateCategory) => {
                                if (category !== 'FX') {
                                  form.setFieldValue(['rates', field.name, 'fromCurrency'], 'USD');
                                  form.setFieldValue(['rates', field.name, 'margin'], 0);
                                }
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={5}>
                          <Form.Item {...field} name={[field.name, 'fromCurrency']} label="Ngoại tệ" className="mb-0"
                            rules={[{ required: true, message: 'Chọn ngoại tệ' }]}>
                            <CurrencyCodeSelect disabled={watchedRates[index]?.category !== 'FX'} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={5}>
                          <RateInput fieldName={field.name} name="buyRate" label="Giá mua" />
                        </Col>
                        <Col xs={24} md={5}>
                          <RateInput fieldName={field.name} name="sellRate" label="Giá bán" />
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item
                            name={[field.name, 'margin']}
                            label="Biên độ"
                            className="mb-0"
                            rules={[{ type: 'number', min: 0, message: 'Biên độ không được âm' }]}
                          >
                            <InputNumber
                              className="w-full"
                              size="large"
                              min={0}
                              precision={6}
                              step={1}
                              controls={false}
                              addonAfter="VND"
                              disabled={watchedRates[index]?.category !== 'FX'}
                              formatter={exchangeRateInputFormatter}
                              parser={exchangeRateInputParser}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </div>
                  ))}
                  <Button type="dashed" block className="h-11!" icon={<PlusOutlined />}
                    disabled={fields.length >= 50} onClick={() => add({ ...EMPTY_RATE })}>
                    Thêm tỷ giá
                  </Button>
                </Space>
              )}
            </Form.List>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Typography.Text type="secondary">{watchedRates.length} tỷ giá trong danh sách</Typography.Text>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} size="large"
                loading={createRateBatch.isPending}>Tạo danh sách chờ duyệt</Button>
            </div>
          </Form>
        </Card>
      )}

      <Card title="Bảng tỷ giá đang áp dụng" size="small" className="mb-4"
        extra={<Tag color="green">ACTIVE</Tag>}>
        <Table<PairedRateRow> className="exchange-rate-table" rowKey="key" loading={isLoadingActive} columns={pairedColumns}
          dataSource={activeRows} scroll={{ x: 720 }} pagination={false} size="small" tableLayout="fixed" />
      </Card>

      <Card title="Tỷ giá thay thế chờ duyệt" size="small">
        <Table<PairedRateRow>
          className="exchange-rate-table"
          rowKey="key"
          loading={isLoadingPending}
          columns={pendingColumns}
          dataSource={pendingRows}
          scroll={{ x: 860 }}
          size="small"
          tableLayout="fixed"
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <Modal
        title="Nhập bảng tỷ giá từ ảnh"
        width={1000}
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
            className="exchange-rate-table mt-4"
            rowKey={(_, index) => String(index)}
            pagination={false}
            scroll={{ x: 900 }}
            size="small"
            dataSource={parsedRates}
            columns={[
              { title: 'Loại', width: 165, render: (_, rate, index) => (
                <Select className="w-full" value={rate.rateType} options={RATE_TYPES}
                  onChange={(rateType) => updateParsedRate(index, { rateType, provider: providerForRateType(rateType) })} />
              ) },
              { title: 'Ngoại tệ', width: 105, render: (_, rate, index) => (
                <Select className="w-full" value={rate.fromCurrency} showSearch optionFilterProp="label"
                  options={CURRENCIES.filter((currency) => currency.code !== 'VND').map((currency) => ({ value: currency.code, label: `${currency.code} - ${currency.country}` }))}
                  onChange={(fromCurrency) => updateParsedRate(index, { fromCurrency })} />
              ) },
              { title: 'Tỷ giá', width: 230, render: (_, rate, index) => rate.rateType === 'BANK_RATE' ? (
                <Space direction="vertical" size={6} className="w-full">
                  <InputNumber className="w-full" min={0} value={rate.buyRate ?? rate.rate ?? 0}
                    addonBefore="Mua" formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser}
                    onChange={(value) => updateParsedRate(index, { rate: Number(value ?? 0), buyRate: Number(value ?? 0) })} />
                  <InputNumber className="w-full" min={0} value={rate.sellRate ?? 0}
                    addonBefore="Bán" formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser}
                    onChange={(value) => updateParsedRate(index, { sellRate: Number(value ?? 0) })} />
                </Space>
              ) : (
                <InputNumber className="w-full" min={0} value={rate.rate ?? 0}
                  formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser}
                  onChange={(value) => updateParsedRate(index, { rate: Number(value ?? 0) })} />
              ) },
              { title: 'Biên độ', width: 145, render: (_, rate, index) => (
                <InputNumber className="w-full" min={0} precision={6} value={rate.margin ?? 0}
                  disabled={rate.rateType !== 'FX_BUY' && rate.rateType !== 'FX_SELL'}
                  formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser}
                  onChange={(value) => updateParsedRate(index, { margin: Number(value ?? 0) })} />
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

function CurrencyCodeSelect({ value, onChange, disabled }: { value?: string; onChange?: (value: string) => void; disabled?: boolean }) {
  return (
    <Select
      mode="tags"
      maxCount={1}
      size="large"
      showSearch
      optionFilterProp="label"
      tokenSeparators={[',', ' ']}
      value={value ? [value] : []}
      options={RATE_CURRENCY_OPTIONS}
      placeholder="Chọn hoặc nhập mã"
      disabled={disabled}
      onChange={(values) => onChange?.(normalizeCurrencyCode(values[values.length - 1]))}
    />
  );
}

function RateInput({ fieldName, name, label }: { fieldName: number; name: 'buyRate' | 'sellRate'; label: string }) {
  return (
    <Form.Item
      name={[fieldName, name]}
      label={label}
      className="mb-0"
      rules={[
        { required: true, message: `Nhập ${label.toLowerCase()}` },
        { type: 'number', min: 0.000001, message: `${label} phải lớn hơn 0` },
      ]}
    >
      <InputNumber
        className="w-full"
        size="large"
        min={0}
        precision={6}
        step={0.01}
        controls={false}
        addonAfter="VND"
        formatter={exchangeRateInputFormatter}
        parser={exchangeRateInputParser}
      />
    </Form.Item>
  );
}

function buildRatePayload(rateType: ExchangeRateType, fromCurrency: string, rate: number, margin: number): CreateRatePayload {
  return {
    rateType,
    provider: providerForRateType(rateType),
    fromCurrency,
    toCurrency: 'VND',
    rate,
    margin,
  };
}

function rateMargin(row: PairedRateRow) {
  return row.buy?.margin ?? row.sell?.margin ?? row.bank?.margin ?? 0;
}

function rateCategoryLabel(category: RateCategory) {
  return RATE_CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

function rateCategoryDescription(category: RateCategory) {
  if (category === 'PAID') return 'Cặp Paid mua và Paid bán dùng cho WU/MG';
  if (category === 'FX') return 'Cặp giá công ty mua và bán ngoại tệ';
  return 'Cặp giá mua/bán ngân hàng; giá mua dùng giải quyết công nợ USD lẻ';
}

function categoryForRate(rateType: ExchangeRateType): RateCategory | null {
  if (rateType === 'PAID_BUY' || rateType === 'PAID_SELL') return 'PAID';
  if (rateType === 'FX_BUY' || rateType === 'FX_SELL') return 'FX';
  if (rateType === 'BANK_RATE') return 'BANK';
  return null;
}

function pairRates(rates: ExchangeRateDto[]): PairedRateRow[] {
  const groups = new Map<string, { category: RateCategory; fromCurrency: string; buy: ExchangeRateDto[]; sell: ExchangeRateDto[]; bank: ExchangeRateDto[] }>();

  rates.forEach((rate) => {
    const category = categoryForRate(rate.rateType);
    if (!category) return;
    const baseKey = `${category}:${rate.fromCurrency}`;
    const group = groups.get(baseKey) ?? { category, fromCurrency: rate.fromCurrency, buy: [], sell: [], bank: [] };
    if (rate.rateType === 'PAID_BUY' || rate.rateType === 'FX_BUY') group.buy.push(rate);
    else if (rate.rateType === 'PAID_SELL' || rate.rateType === 'FX_SELL') group.sell.push(rate);
    else group.bank.push(rate);
    groups.set(baseKey, group);
  });

  const rows = [...groups.entries()].flatMap(([baseKey, group]) => {
    const newestFirst = (a: ExchangeRateDto, b: ExchangeRateDto) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
    group.buy.sort(newestFirst);
    group.sell.sort(newestFirst);
    group.bank.sort(newestFirst);
    const rowCount = Math.max(group.buy.length, group.sell.length, group.bank.length);
    return Array.from({ length: rowCount }, (_, index) => ({
      key: `${baseKey}:${index}`,
      category: group.category,
      fromCurrency: group.fromCurrency,
      buy: group.buy[index],
      sell: group.sell[index],
      bank: group.bank[index],
    }));
  });

  const categoryOrder: Record<RateCategory, number> = { PAID: 0, FX: 1, BANK: 2 };
  return rows.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]
    || a.fromCurrency.localeCompare(b.fromCurrency));
}

function latestRate(row: PairedRateRow) {
  return [row.buy, row.sell, row.bank]
    .filter(Boolean)
    .sort((a, b) => Date.parse(b!.effectiveFrom) - Date.parse(a!.effectiveFrom))[0];
}

function renderRowRate(row: PairedRateRow, side: 'buy' | 'sell') {
  const rate = row.category === 'BANK' ? row.bank : side === 'buy' ? row.buy : row.sell;
  const value = row.category === 'BANK'
    ? (side === 'buy' ? rate?.buyRate ?? rate?.rate : rate?.sellRate)
    : rate?.rate;
  if (!rate || value === null || value === undefined) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <div className="exchange-rate-value">
      <strong>{formatExchangeRate(value, 6)}</strong>
      <span>VND/{rate.fromCurrency}</span>
    </div>
  );
}
