import {
  CameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, InputNumber, Row, Space, Table, Tabs, Tag, Typography, Upload } from 'antd';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  formatDateTime,
  formatUsd,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
} from '@/shared/utils/formatters';
import { cashCountsMock, usdDenominations, vndDenominations } from '../data/cashCount.mock';
import type { CashCountStatus } from '../model/cashCount.types';

const statusMeta: Record<CashCountStatus, { label: string; color: string; icon: JSX.Element }> = {
  DRAFT:     { label: 'Bản nháp', color: 'default', icon: <ClockCircleOutlined /> },
  SUBMITTED: { label: 'Đã gửi',   color: 'blue',    icon: <SendOutlined /> },
  APPROVED:  { label: 'Đã duyệt', color: 'green',   icon: <CheckCircleOutlined /> },
  DISPUTED:  { label: 'Chênh lệch', color: 'red',   icon: <ExclamationCircleOutlined /> },
};

function DenominationInput({
  values,
  onChange,
  currency,
}: {
  values: Record<number, number>;
  onChange: (denom: number, count: number) => void;
  currency: 'VND' | 'USD';
}) {
  const list = currency === 'VND' ? vndDenominations : usdDenominations;
  return (
    <Table
      rowKey="value"
      size="small"
      pagination={false}
      dataSource={list.map((v) => ({ value: v, count: values[v] ?? 0 }))}
      columns={[
        {
          title: 'Mệnh giá',
          dataIndex: 'value',
          render: (v: number) =>
            currency === 'VND' ? (
              <Typography.Text strong>{formatVnd(v)}</Typography.Text>
            ) : (
              <Typography.Text strong>{formatUsd(v, 0)}</Typography.Text>
            ),
        },
        {
          title: 'Số lượng',
          dataIndex: 'count',
          render: (_: number, row: { value: number; count: number }) => (
            <InputNumber
              min={0}
              value={row.count}
              onChange={(v) => onChange(row.value, Number(v ?? 0))}
              formatter={numberInputFormatter}
              parser={numberInputParser}
              className="w-full"
            />
          ),
        },
        {
          title: 'Thành tiền',
          key: 'total',
          align: 'right',
          render: (_: unknown, row: { value: number; count: number }) => (
            <Typography.Text>
              {currency === 'VND'
                ? formatVnd(row.value * row.count)
                : formatUsd(row.value * row.count)}
            </Typography.Text>
          ),
        },
      ]}
    />
  );
}

function OpenShiftPanel() {
  const [vnd, setVnd] = useState<Record<number, number>>({});
  const [usd, setUsd] = useState<Record<number, number>>({});

  const vndTotal = useMemo(
    () => Object.entries(vnd).reduce((s, [k, c]) => s + Number(k) * c, 0),
    [vnd],
  );
  const usdTotal = useMemo(
    () => Object.entries(usd).reduce((s, [k, c]) => s + Number(k) * c, 0),
    [usd],
  );

  const vndExpected = 325_000_000;
  const usdExpected = 48_200;

  return (
    <>
      <Row gutter={16} className="mb-4">
        <Col xs={24} md={8}>
          <Card>
            <Typography.Text type="secondary" className="uppercase text-xs!">Số dư kỳ vọng (VND)</Typography.Text>
            <Typography.Title level={3} className="m-0! text-blue-600!">{formatVnd(vndExpected)}</Typography.Title>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Typography.Text type="secondary" className="uppercase text-xs!">Kiểm thực tế (VND)</Typography.Text>
            <Typography.Title level={3} className="m-0!">{formatVnd(vndTotal)}</Typography.Title>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Typography.Text type="secondary" className="uppercase text-xs!">Chênh lệch VND</Typography.Text>
            <Typography.Title
              level={3}
              className="m-0!"
              style={{ color: vndTotal === vndExpected ? '#16a34a' : vndTotal > vndExpected ? '#d97706' : '#dc2626' }}
            >
              {vndTotal - vndExpected === 0 ? '0 VND' : formatVnd(vndTotal - vndExpected)}
            </Typography.Title>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="Đếm tiền VND theo mệnh giá" className="mb-4">
            <DenominationInput values={vnd} onChange={(d, c) => setVnd({ ...vnd, [d]: c })} currency="VND" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <div className="flex justify-between items-center gap-2">
                <span>Đếm tiền USD</span>
                <Tag color={usdTotal === usdExpected ? 'green' : 'red'}>
                  Δ: {formatUsd(usdTotal - usdExpected, 0)}
                </Tag>
              </div>
            }
            className="mb-4"
          >
            <DenominationInput values={usd} onChange={(d, c) => setUsd({ ...usd, [d]: c })} currency="USD" />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <CameraOutlined />
            <span>Bằng chứng kiểm tiền</span>
          </Space>
        }
        className="mb-4"
      >
        <Upload.Dragger multiple listType="picture" beforeUpload={() => false} accept="image/*">
          <p><FileImageOutlined className="text-3xl text-blue-500" /></p>
          <p>Kéo thả ảnh vào đây hoặc click để chọn</p>
          <Typography.Text type="secondary">Chụp lại két tiền — 2 hoặc 3 góc để đối soát</Typography.Text>
        </Upload.Dragger>
      </Card>

      <div className="flex justify-end gap-2">
        <Button icon={<SaveOutlined />}>Lưu nháp</Button>
        <Button type="primary" icon={<SendOutlined />}>Gửi kiểm quỹ</Button>
      </div>
    </>
  );
}

function HistoryPanel() {
  return (
    <Card>
      <Table
        rowKey="id"
        dataSource={cashCountsMock}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: 'Thời gian',
            dataIndex: 'performedAt',
            render: (v: string) => formatDateTime(v),
          },
          { title: 'Chi nhánh', dataIndex: 'branchName' },
          {
            title: 'Loại',
            dataIndex: 'type',
            render: (v: string) => {
              const label = v === 'OPEN_SHIFT' ? 'Đầu ca' : v === 'CLOSE_SHIFT' ? 'Cuối ca' : 'Kiểm đột xuất';
              return <Tag>{label}</Tag>;
            },
          },
          { title: 'Người kiểm', dataIndex: 'performedBy' },
          {
            title: 'Kỳ vọng',
            dataIndex: 'expected',
            align: 'right',
            render: (v: number, r) => (r.currency === 'VND' ? formatVnd(v) : formatUsd(v, 0)),
          },
          {
            title: 'Thực tế',
            dataIndex: 'actual',
            align: 'right',
            render: (v: number, r) => (r.currency === 'VND' ? formatVnd(v) : formatUsd(v, 0)),
          },
          {
            title: 'Chênh lệch',
            dataIndex: 'difference',
            align: 'right',
            render: (v: number, r) => {
              if (v === 0) return <Tag color="green">0</Tag>;
              const value = r.currency === 'VND' ? formatVnd(v) : formatUsd(v, 0);
              return <Tag color={v > 0 ? 'gold' : 'red'}>{value}</Tag>;
            },
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            render: (v: CashCountStatus) => {
              const m = statusMeta[v];
              return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
            },
          },
        ]}
      />
    </Card>
  );
}

export function CashCountPage() {
  return (
    <PageScaffold
      title="Kiểm quỹ chi nhánh"
      description="Kiểm tra tồn quỹ đầu ca / cuối ca theo mệnh giá tiền, so với số kỳ vọng và ghi nhận chênh lệch."
      moduleName="cash-count"
      extra={<Space><Tag color="blue" icon={<DollarOutlined />}>Chi nhánh NCT</Tag></Space>}
    >
      <Tabs
        items={[
          { key: 'open',   label: 'Kiểm quỹ đầu ca',   children: <OpenShiftPanel /> },
          { key: 'close',  label: 'Kiểm quỹ cuối ca',  children: <OpenShiftPanel /> },
          { key: 'history', label: 'Lịch sử kiểm quỹ', children: <HistoryPanel /> },
        ]}
      />
    </PageScaffold>
  );
}
