import { EyeOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Row,
  Col,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime, formatExchangeRatePair } from '@/shared/utils/formatters';
import type {
  ExchangeRateHistoryDto,
  ExchangeRateType,
  RateStatus,
  ServiceProvider,
} from '../api/exchangeRate.api';
import { useExchangeRateHistory } from '../hooks/useExchangeRates';

const RATE_TYPES: Array<{ value: ExchangeRateType; label: string }> = [
  { value: 'PAID_BUY', label: 'Paid mua' },
  { value: 'PAID_SELL', label: 'Paid bán' },
  { value: 'BANK_RATE', label: 'Tỷ giá ngân hàng' },
  { value: 'FX_BUY', label: 'Mua ngoại tệ' },
  { value: 'FX_SELL', label: 'Bán ngoại tệ' },
  { value: 'WU_SYSTEM', label: 'WU hệ thống (cũ)' },
  { value: 'WU_PROVIDER', label: 'WU provider (cũ)' },
  { value: 'MG_SYSTEM', label: 'MG hệ thống (cũ)' },
];

const STATUS_META: Record<RateStatus, { label: string; color?: string }> = {
  DRAFT: { label: 'Chờ duyệt', color: 'gold' },
  ACTIVE: { label: 'Đang áp dụng', color: 'green' },
  SUPERSEDED: { label: 'Đã thay thế' },
  REJECTED: { label: 'Đã từ chối', color: 'red' },
};

const PROVIDERS: Array<{ value: ServiceProvider; label: string }> = [
  { value: 'WU_MG', label: 'WU/MG' },
  { value: 'BANK', label: 'Ngân hàng' },
  { value: 'INTERNAL', label: 'Nội bộ' },
  { value: 'WU', label: 'WU (cũ)' },
  { value: 'MG', label: 'MG (cũ)' },
];

export function ExchangeRateHistoryPage() {
  const navigate = useNavigate();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<RateStatus>();
  const [rateType, setRateType] = useState<ExchangeRateType>();
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRate, setSelectedRate] = useState<ExchangeRateHistoryDto | null>(null);

  const params = useMemo(() => ({
    page,
    pageSize,
    status,
    rateType,
    from,
    to,
    keyword: keyword || undefined,
  }), [page, pageSize, status, rateType, from, to, keyword]);
  const { data, isLoading, isError, refetch } = useExchangeRateHistory(params);

  const applyKeyword = (value: string) => {
    setKeyword(value.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setStatus(undefined);
    setRateType(undefined);
    setFrom(undefined);
    setTo(undefined);
    setPage(1);
  };

  const columns: ColumnsType<ExchangeRateHistoryDto> = [
    {
      title: 'Loại tỷ giá',
      dataIndex: 'rateType',
      fixed: 'left',
      width: 180,
      render: (value: ExchangeRateType, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{rateTypeLabel(value)}</Typography.Text>
          <Typography.Text type="secondary">{providerLabel(record.provider)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Cặp tiền',
      width: 110,
      render: (_, record) => <Typography.Text>{record.fromCurrency}/{record.toCurrency}</Typography.Text>,
    },
    {
      title: 'Tỷ giá',
      dataIndex: 'rate',
      align: 'right',
      width: 190,
      render: (value: number, record) => (
        <Typography.Text strong>
          {formatExchangeRatePair(value, record.fromCurrency, record.toCurrency, 6)}
        </Typography.Text>
      ),
    },
    {
      title: 'Người nhập / duyệt',
      width: 210,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.createdByName}</Typography.Text>
          <Typography.Text type="secondary">Duyệt: {record.approvedByName ?? 'Chưa duyệt'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Hiệu lực',
      width: 190,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{formatDateTime(record.effectiveFrom)}</Typography.Text>
          <Typography.Text type="secondary">Đến: {record.effectiveTo ? formatDateTime(record.effectiveTo) : 'Hiện tại'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      align: 'center',
      width: 130,
      render: (value: RateStatus) => <Tag color={STATUS_META[value].color}>{STATUS_META[value].label}</Tag>,
    },
    {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 120,
      render: (_, record) => (
        <Button type="text" icon={<EyeOutlined />} onClick={() => setSelectedRate(record)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Lịch sử Tỷ Giá"
      description="Tra cứu toàn bộ vòng đời tỷ giá đã tạo, duyệt, thay thế hoặc từ chối trên hệ thống."
      moduleName="exchange-rate-history"
      extra={
        <Button icon={<SwapOutlined />} onClick={() => navigate('/exchange-rate')}>
          Tỷ giá hiện tại
        </Button>
      }
    >
      <Card>
        <Row gutter={[12, 12]} className="mb-4">
          <Col xs={24} lg={7}>
            <Input.Search
              allowClear
              placeholder="Tìm người nhập"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onSearch={applyKeyword}
            />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Select
              allowClear
              placeholder="Trạng thái"
              value={status}
              className="w-full"
              onChange={(value) => { setStatus(value); setPage(1); }}
              options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select
              allowClear
              placeholder="Loại tỷ giá"
              value={rateType}
              className="w-full"
              onChange={(value) => { setRateType(value); setPage(1); }}
              options={RATE_TYPES}
            />
          </Col>
          <Col xs={24} lg={5}>
            <DatePicker.RangePicker
              className="w-full"
              format="DD/MM/YYYY"
              onChange={(dates) => {
                setFrom(dates?.[0]?.format('YYYY-MM-DD'));
                setTo(dates?.[1]?.format('YYYY-MM-DD'));
                setPage(1);
              }}
            />
          </Col>
          <Col xs={24} sm={12} lg={3}>
            <Button block icon={<ReloadOutlined />} onClick={resetFilters}>Xóa bộ lọc</Button>
          </Col>
        </Row>

        {isError && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            message="Không tải được lịch sử tỷ giá"
            action={<Button size="small" onClick={() => refetch()}>Thử lại</Button>}
          />
        )}

        <Table<ExchangeRateHistoryDto>
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          scroll={{ x: 1150 }}
          pagination={{
            current: data?.page ?? page,
            pageSize: data?.pageSize ?? pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `${total} bản ghi`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Drawer
        title="Chi tiết tỷ giá"
        width={560}
        open={Boolean(selectedRate)}
        onClose={() => setSelectedRate(null)}
      >
        {selectedRate && (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Trạng thái" span={2}>
              <Tag color={STATUS_META[selectedRate.status].color}>{STATUS_META[selectedRate.status].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Loại tỷ giá" span={2}>{rateTypeLabel(selectedRate.rateType)}</Descriptions.Item>
            <Descriptions.Item label="Nhóm áp dụng">{providerLabel(selectedRate.provider)}</Descriptions.Item>
            <Descriptions.Item label="Cặp tiền">{selectedRate.fromCurrency}/{selectedRate.toCurrency}</Descriptions.Item>
            <Descriptions.Item label="Tỷ giá" span={2}>
              {formatExchangeRatePair(selectedRate.rate, selectedRate.fromCurrency, selectedRate.toCurrency, 6)}
            </Descriptions.Item>
            <Descriptions.Item label="Người nhập">{selectedRate.createdByName}</Descriptions.Item>
            <Descriptions.Item label="Tạo lúc">{formatDateTime(selectedRate.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Người duyệt">{selectedRate.approvedByName ?? 'Chưa duyệt'}</Descriptions.Item>
            <Descriptions.Item label="Duyệt lúc">{selectedRate.approvedAt ? formatDateTime(selectedRate.approvedAt) : 'Chưa duyệt'}</Descriptions.Item>
            <Descriptions.Item label="Hiệu lực từ">{formatDateTime(selectedRate.effectiveFrom)}</Descriptions.Item>
            <Descriptions.Item label="Hiệu lực đến">{selectedRate.effectiveTo ? formatDateTime(selectedRate.effectiveTo) : 'Hiện tại'}</Descriptions.Item>
            <Descriptions.Item label="Mã bản ghi" span={2}>{selectedRate.id}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </PageScaffold>
  );
}

function rateTypeLabel(rateType: ExchangeRateType) {
  return RATE_TYPES.find((option) => option.value === rateType)?.label ?? rateType;
}

function providerLabel(provider?: ServiceProvider | null) {
  return PROVIDERS.find((option) => option.value === provider)?.label ?? provider ?? 'Không áp dụng';
}
