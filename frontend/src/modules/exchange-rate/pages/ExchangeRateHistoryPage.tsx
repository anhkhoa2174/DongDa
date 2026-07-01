import { EyeOutlined, FilterOutlined, SwapOutlined } from '@ant-design/icons';
import {
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
import { formatNumber } from '@/shared/utils/formatters';
import { historicalFundARatesMock, rateHistoryMock } from '../data/exchangeRates.mock';
import type { RateHistory } from '../model/exchangeRate.types';

export function ExchangeRateHistoryPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'all' | RateHistory['status']>('all');
  const [selectedHistory, setSelectedHistory] = useState<RateHistory | null>(null);

  const filteredData = useMemo(
    () =>
      rateHistoryMock.filter((item) => {
        const matchesKeyword = [item.version, item.submittedBy, item.approvedBy]
          .join(' ')
          .toLowerCase()
          .includes(keyword.toLowerCase());
        const matchesStatus = status === 'all' || item.status === status;
        return matchesKeyword && matchesStatus;
      }),
    [keyword, status],
  );

  const columns: ColumnsType<RateHistory> = [
    {
      title: 'Phiên bản',
      dataIndex: 'version',
      fixed: 'left',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      title: 'Thời gian áp dụng',
      key: 'effectiveTime',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.effectiveFrom}</Typography.Text>
          <Typography.Text type="secondary">đến {record.effectiveTo}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Paid Bán', dataIndex: 'paidSell', align: 'right', render: formatRate },
    { title: 'Paid Mua', dataIndex: 'paidBuy', align: 'right', render: formatRate },
    { title: 'Giá Bán', dataIndex: 'sell', align: 'right', render: formatRate },
    { title: 'Giá Mua', dataIndex: 'buy', align: 'right', render: formatRate },
    {
      title: 'Quỹ A',
      dataIndex: 'fundACount',
      align: 'center',
      render: (value: number) => `${value} ngoại tệ`,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      align: 'center',
      render: (value: RateHistory['status']) =>
        value === 'active' ? <Tag color="green">ACTIVE</Tag> : <Tag>HẾT HIỆU LỰC</Tag>,
    },
    {
      title: '',
      key: 'action',
      fixed: 'right',
      render: (_, record) => (
        <Button type="text" icon={<EyeOutlined />} onClick={() => setSelectedHistory(record)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Lịch sử Tỷ Giá"
      description="Tra cứu các phiên bản tỷ giá đã được duyệt và từng áp dụng trên toàn hệ thống."
      moduleName="exchange-rate-history"
      extra={
        <Button icon={<SwapOutlined />} onClick={() => navigate('/exchange-rate')}>
          Tỷ giá hiện tại
        </Button>
      }
    >
      <Card>
        <Row gutter={[12, 12]} className="mb-4">
          <Col xs={24} md={9}>
            <Input.Search
              allowClear
              placeholder="Tìm phiên bản, người nhập hoặc người duyệt"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Select
              value={status}
              className="w-full"
              onChange={setStatus}
              options={[
                { value: 'all', label: 'Tất cả trạng thái' },
                { value: 'active', label: 'Đang áp dụng' },
                { value: 'expired', label: 'Hết hiệu lực' },
              ]}
            />
          </Col>
          <Col xs={24} sm={12} md={7}>
            <DatePicker.RangePicker className="w-full" format="DD/MM/YYYY" />
          </Col>
          <Col xs={24} md={3}>
            <Button block icon={<FilterOutlined />}>Lọc</Button>
          </Col>
        </Row>
        <Table
          columns={columns}
          dataSource={filteredData}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1250 }}
        />
      </Card>

      <Drawer
        title={selectedHistory ? `Chi tiết ${selectedHistory.version}` : 'Chi tiết tỷ giá'}
        width={560}
        open={Boolean(selectedHistory)}
        onClose={() => setSelectedHistory(null)}
      >
        {selectedHistory && (
          <Space direction="vertical" size={16} className="w-full">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Trạng thái" span={2}>
                {selectedHistory.status === 'active' ? <Tag color="green">ACTIVE</Tag> : <Tag>HẾT HIỆU LỰC</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Paid Bán">{formatRate(selectedHistory.paidSell)}</Descriptions.Item>
              <Descriptions.Item label="Paid Mua">{formatRate(selectedHistory.paidBuy)}</Descriptions.Item>
              <Descriptions.Item label="Giá Bán">{formatRate(selectedHistory.sell)}</Descriptions.Item>
              <Descriptions.Item label="Giá Mua">{formatRate(selectedHistory.buy)}</Descriptions.Item>
              <Descriptions.Item label="Người nhập" span={2}>{selectedHistory.submittedBy}</Descriptions.Item>
              <Descriptions.Item label="Người duyệt" span={2}>{selectedHistory.approvedBy}</Descriptions.Item>
              <Descriptions.Item label="Hiệu lực từ">{selectedHistory.effectiveFrom}</Descriptions.Item>
              <Descriptions.Item label="Hiệu lực đến">{selectedHistory.effectiveTo}</Descriptions.Item>
            </Descriptions>
            <Card size="small" title="Tỷ giá Quỹ A của phiên bản">
              <Table
                size="small"
                pagination={false}
                dataSource={historicalFundARatesMock}
                columns={[
                  { title: 'Ngoại tệ', dataIndex: 'currency' },
                  { title: 'Giá mua', dataIndex: 'buy', align: 'right', render: formatRate },
                  { title: 'Giá bán', dataIndex: 'sell', align: 'right', render: formatRate },
                ]}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </PageScaffold>
  );
}

function formatRate(value: number) {
  return formatNumber(value, 2);
}
