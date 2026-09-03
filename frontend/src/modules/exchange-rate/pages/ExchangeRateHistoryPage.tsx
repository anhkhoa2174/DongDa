import { ArrowLeftOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
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
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { getCurrencyMetadata } from '@/shared/constants/currencies';
import { formatDateTime, formatExchangeRate } from '@/shared/utils/formatters';
import { DATE_INPUT_FORMAT, DATE_RANGE_PLACEHOLDERS } from '@/shared/utils/datePicker';
import type {
  ExchangeRateGroup,
  ExchangeRateHistoryGroupDto,
  ExchangeRateHistoryDto,
  RateStatus,
} from '../api/exchangeRate.api';
import { useExchangeRateHistory } from '../hooks/useExchangeRates';

const RATE_GROUPS: Array<{ value: ExchangeRateGroup; label: string }> = [
  { value: 'PAID', label: 'Tỷ giá Paid' },
  { value: 'FX', label: 'Tỷ giá mua/bán' },
  { value: 'BANK', label: 'Tỷ giá Ngân hàng' },
];

const STATUS_META: Record<RateStatus, { label: string; color?: string }> = {
  DRAFT: { label: 'Chờ duyệt', color: 'gold' },
  ACTIVE: { label: 'Đang áp dụng', color: 'green' },
  SUPERSEDED: { label: 'Đã thay thế' },
  REJECTED: { label: 'Đã từ chối', color: 'red' },
};

export function ExchangeRateHistoryPage() {
  const navigate = useNavigate();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<RateStatus>();
  const [rateGroup, setRateGroup] = useState<ExchangeRateGroup>();
  const [from, setFrom] = useState<string>();
  const [to, setTo] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedGroup, setSelectedGroup] = useState<ExchangeRateHistoryGroupDto | null>(null);

  const params = useMemo(() => ({
    page,
    pageSize,
    status,
    rateGroup,
    from,
    to,
    keyword: keyword || undefined,
  }), [page, pageSize, status, rateGroup, from, to, keyword]);
  const { data, isLoading, isError, refetch } = useExchangeRateHistory(params);

  const applyKeyword = (value: string) => {
    setKeyword(value.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setKeywordInput('');
    setKeyword('');
    setStatus(undefined);
    setRateGroup(undefined);
    setFrom(undefined);
    setTo(undefined);
    setPage(1);
  };

  const columns: ColumnsType<ExchangeRateHistoryGroupDto> = [
    {
      title: 'Loại tỷ giá',
      dataIndex: 'category',
      fixed: 'left',
      width: 150,
      render: (value: ExchangeRateGroup) => <Typography.Text strong>{rateGroupLabel(value)}</Typography.Text>,
    },
    {
      title: 'Ngoại tệ',
      dataIndex: 'fromCurrency',
      width: 115,
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
    {
      title: 'Giá mua',
      key: 'buyRate',
      align: 'right',
      width: 145,
      render: (_, row) => renderHistoryGroupRate(row, 'buy'),
    },
    {
      title: 'Giá bán',
      key: 'sellRate',
      align: 'right',
      width: 145,
      render: (_, row) => renderHistoryGroupRate(row, 'sell'),
    },
    {
      title: 'Biên độ',
      key: 'margin',
      align: 'right',
      width: 120,
      render: (_, row) => `${formatExchangeRate(historyGroupMargin(row), 6)} VND`,
    },
    {
      title: 'Người tạo / thời gian',
      width: 180,
      responsive: ['xl'],
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.createdByName}</Typography.Text>
          <Typography.Text type="secondary">{formatDateTime(record.createdAt)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '',
      key: 'action',
      fixed: 'right',
      width: 48,
      render: (_, record) => (
        <Tooltip title="Xem chi tiết">
          <Button type="text" aria-label="Xem chi tiết" icon={<EyeOutlined />} onClick={() => setSelectedGroup(record)} />
        </Tooltip>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Lịch sử Tỷ Giá"
      description="Tra cứu theo từng nhóm tỷ giá đã tạo. Giá mua, giá bán và tỷ giá Ngân hàng giữ nguyên trạng thái phê duyệt riêng."
      moduleName="exchange-rate-history"
      extra={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/exchange-rate')}>
          Quay lại Tạo / duyệt tỷ giá
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
              value={rateGroup}
              className="w-full"
              onChange={(value) => { setRateGroup(value); setPage(1); }}
              options={RATE_GROUPS}
            />
          </Col>
          <Col xs={24} lg={5}>
            <DatePicker.RangePicker
              className="w-full"
              format={DATE_INPUT_FORMAT}
              placeholder={DATE_RANGE_PLACEHOLDERS}
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

        <Table<ExchangeRateHistoryGroupDto>
          className="exchange-rate-table"
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading}
          scroll={{ x: 760 }}
          size="small"
          tableLayout="fixed"
          pagination={{
            current: data?.page ?? page,
            pageSize: data?.pageSize ?? pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `${total} nhóm tỷ giá`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Drawer
        title="Chi tiết nhóm tỷ giá"
        width="min(680px, 100vw)"
        open={Boolean(selectedGroup)}
        onClose={() => setSelectedGroup(null)}
      >
        {selectedGroup && (
          <Space direction="vertical" size={16} className="w-full">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Loại tỷ giá">{rateGroupLabel(selectedGroup.category)}</Descriptions.Item>
              <Descriptions.Item label="Ngoại tệ">{selectedGroup.fromCurrency}/{selectedGroup.toCurrency}</Descriptions.Item>
              <Descriptions.Item label="Quốc gia">{getCurrencyMetadata(selectedGroup.fromCurrency).country}</Descriptions.Item>
              <Descriptions.Item label="Người tạo">{selectedGroup.createdByName}</Descriptions.Item>
              <Descriptions.Item label="Biên độ">{formatExchangeRate(historyGroupMargin(selectedGroup), 6)} VND</Descriptions.Item>
              <Descriptions.Item label="Tạo lúc" span={2}>{formatDateTime(selectedGroup.createdAt)}</Descriptions.Item>
            </Descriptions>
            {selectedGroup.buy && <HistoryRateDetail title="Giá mua" rate={selectedGroup.buy} />}
            {selectedGroup.sell && <HistoryRateDetail title="Giá bán" rate={selectedGroup.sell} />}
            {selectedGroup.bank && <HistoryBankRateDetail rate={selectedGroup.bank} />}
          </Space>
        )}
      </Drawer>
    </PageScaffold>
  );
}

function rateGroupLabel(rateGroup: ExchangeRateGroup) {
  return RATE_GROUPS.find((option) => option.value === rateGroup)?.label ?? rateGroup;
}

function historyGroupMargin(group: ExchangeRateHistoryGroupDto) {
  return group.buy?.margin ?? group.sell?.margin ?? group.bank?.margin ?? 0;
}

function renderHistoryGroupRate(group: ExchangeRateHistoryGroupDto, side: 'buy' | 'sell') {
  const rate = group.category === 'BANK' ? group.bank : side === 'buy' ? group.buy : group.sell;
  const value = group.category === 'BANK'
    ? (side === 'buy' ? rate?.buyRate ?? rate?.rate : rate?.sellRate)
    : rate?.rate;
  if (!rate || value === null || value === undefined) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <div className="exchange-rate-value exchange-rate-value--compact">
      <strong>{formatExchangeRate(value, 6)}</strong>
      <Tag color={STATUS_META[rate.status].color}>{STATUS_META[rate.status].label}</Tag>
    </div>
  );
}

function HistoryBankRateDetail({ rate }: { rate: ExchangeRateHistoryDto }) {
  return (
    <Card size="small" title="Tỷ giá Ngân hàng" extra={<Tag color={STATUS_META[rate.status].color}>{STATUS_META[rate.status].label}</Tag>}>
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="Giá mua">
          <Typography.Text strong>{formatExchangeRate(rate.buyRate ?? rate.rate, 6)} VND/{rate.fromCurrency}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Giá bán">
          <Typography.Text strong>{rate.sellRate ? `${formatExchangeRate(rate.sellRate, 6)} VND/${rate.fromCurrency}` : 'Chưa có'}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Người duyệt">{rate.approvedByName ?? 'Chưa duyệt'}</Descriptions.Item>
        <Descriptions.Item label="Duyệt lúc">{rate.approvedAt ? formatDateTime(rate.approvedAt) : 'Chưa duyệt'}</Descriptions.Item>
        <Descriptions.Item label="Hiệu lực">{formatDateTime(rate.effectiveFrom)}</Descriptions.Item>
        <Descriptions.Item label="Hiệu lực đến">{rate.effectiveTo ? formatDateTime(rate.effectiveTo) : 'Hiện tại'}</Descriptions.Item>
        <Descriptions.Item label="Mã bản ghi" span={2}>{rate.id}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function HistoryRateDetail({ title, rate }: { title: string; rate: ExchangeRateHistoryDto }) {
  return (
    <Card size="small" title={title} extra={<Tag color={STATUS_META[rate.status].color}>{STATUS_META[rate.status].label}</Tag>}>
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="Tỷ giá">
          <Typography.Text strong>{formatExchangeRate(rate.rate, 6)} VND/{rate.fromCurrency}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="Biên độ">{formatExchangeRate(rate.margin, 6)} VND</Descriptions.Item>
        <Descriptions.Item label="Người duyệt">{rate.approvedByName ?? 'Chưa duyệt'}</Descriptions.Item>
        <Descriptions.Item label="Duyệt lúc">{rate.approvedAt ? formatDateTime(rate.approvedAt) : 'Chưa duyệt'}</Descriptions.Item>
        <Descriptions.Item label="Hiệu lực">{formatDateTime(rate.effectiveFrom)}</Descriptions.Item>
        <Descriptions.Item label="Hiệu lực đến">{rate.effectiveTo ? formatDateTime(rate.effectiveTo) : 'Hiện tại'}</Descriptions.Item>
        <Descriptions.Item label="Mã bản ghi">{rate.id}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
