import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  ThunderboltOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tabs, Tag, Typography, Upload } from 'antd';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { journalUploadsMock, wuReconciliationRowsMock } from '../data/reconciliation.mock';
import type { ReconciliationResult, ReconciliationRow } from '../model/reconciliation.types';

const resultMeta: Record<ReconciliationResult, { label: string; color: string; icon: JSX.Element }> = {
  MATCH: { label: 'Khớp', color: 'green', icon: <CheckCircleOutlined /> },
  AMOUNT_MISMATCH: { label: 'Lệch số tiền', color: 'gold', icon: <WarningOutlined /> },
  CUSTOMER_MISMATCH: { label: 'Lệch KH', color: 'gold', icon: <UserSwitchOutlined /> },
  MISSING_IN_SYSTEM: { label: 'Thiếu trong hệ thống', color: 'red', icon: <ExclamationCircleOutlined /> },
  MISSING_IN_JOURNAL: { label: 'Thiếu trong Journal', color: 'red', icon: <ExclamationCircleOutlined /> },
  POTENTIAL_DUPLICATE_CUSTOMER: { label: 'Nghi trùng KH', color: 'blue', icon: <UserSwitchOutlined /> },
};

const confidenceMeta = {
  HIGH: { label: 'High', color: 'green' },
  MEDIUM: { label: 'Medium', color: 'gold' },
  LOW: { label: 'Low', color: 'red' },
} as const;

function ReconciliationRowCard({ row }: { row: ReconciliationRow }) {
  const meta = resultMeta[row.result];
  const bgColor =
    row.result === 'MATCH' ? 'bg-green-50 border-green-200'
    : row.result === 'MISSING_IN_SYSTEM' ? 'bg-red-50 border-red-200'
    : row.result === 'POTENTIAL_DUPLICATE_CUSTOMER' ? 'bg-blue-50 border-blue-200'
    : 'bg-yellow-50 border-yellow-200';

  return (
    <div className={`rounded-lg border p-3 mb-3 ${bgColor}`}>
      <Row gutter={16} align="middle">
        <Col xs={24} md={10}>
          <Typography.Text type="secondary" className="uppercase text-xs!">Journal</Typography.Text>
          <div className="font-medium">{row.externalName ?? '—'} · <code className="text-xs">{row.externalId}</code></div>
          <div className="text-sm">
            {row.externalAmountUsd !== undefined && <span className="mr-2">{formatUsd(row.externalAmountUsd, 0)}</span>}
            {row.externalAmountVnd !== undefined && <span>{formatVnd(row.externalAmountVnd)}</span>}
          </div>
        </Col>
        <Col xs={24} md={4} className="text-center">
          <div className="inline-flex flex-col items-center gap-1">
            <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
            <Tag color={confidenceMeta[row.confidence].color}>Confidence: {confidenceMeta[row.confidence].label}</Tag>
          </div>
        </Col>
        <Col xs={24} md={8}>
          <Typography.Text type="secondary" className="uppercase text-xs!">Hệ thống ({row.branchCode ?? '?'})</Typography.Text>
          {row.systemId ? (
            <>
              <div className="font-medium">{row.systemName} · <code className="text-xs">{row.systemId}</code></div>
              <div className="text-sm">
                {row.systemAmountUsd !== undefined && <span className="mr-2">{formatUsd(row.systemAmountUsd, 0)}</span>}
                {row.systemAmountVnd !== undefined && <span>{formatVnd(row.systemAmountVnd)}</span>}
              </div>
            </>
          ) : (
            <Typography.Text type="secondary" italic>Không tìm thấy giao dịch</Typography.Text>
          )}
        </Col>
        <Col xs={24} md={2} className="text-right">
          {row.result === 'MISSING_IN_SYSTEM' ? (
            <Button size="small" type="primary">Tạo GD</Button>
          ) : row.result === 'MATCH' ? null : (
            <Button size="small">Xử lý</Button>
          )}
        </Col>
      </Row>
    </div>
  );
}

function JournalReconciliationPanel() {
  const [filter, setFilter] = useState<'ALL' | 'ISSUES'>('ALL');
  const rows = useMemo(() => {
    if (filter === 'ALL') return wuReconciliationRowsMock;
    return wuReconciliationRowsMock.filter((r) => r.result !== 'MATCH');
  }, [filter]);

  const matched = wuReconciliationRowsMock.filter((r) => r.result === 'MATCH').length;
  const total = wuReconciliationRowsMock.length;
  const progress = Math.round((matched / total) * 100);

  return (
    <>
      <Card
        className="mb-4 border-l-4 border-l-green-500"
        style={{ background: 'linear-gradient(to right, #ecfdf5, #f0fdf4)' }}
      >
        <Row align="middle" gutter={16}>
          <Col xs={24} md={16}>
            <Typography.Text type="secondary" className="uppercase text-xs!">Mục tiêu: Difference = 0</Typography.Text>
            <Typography.Title level={1} className="m-0! text-green-700!">
              {matched} / {total}
            </Typography.Title>
            <Typography.Text className="text-green-700">
              đã khớp · Tiến độ {progress}%
            </Typography.Text>
          </Col>
          <Col xs={24} md={8} className="text-right">
            <Space direction="vertical" className="w-full">
              <Button type="primary" icon={<ThunderboltOutlined />} block>
                Auto-match high confidence
              </Button>
              <Button block>Export báo cáo</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card className="mb-4">
        <Upload.Dragger accept=".pdf,.xlsx,.csv" beforeUpload={() => false}>
          <p><CloudUploadOutlined className="text-4xl text-blue-500" /></p>
          <p className="font-medium">Upload Nhật ký WU / MG / Sao kê ngân hàng</p>
          <Typography.Text type="secondary">Hỗ trợ PDF · Excel · CSV — hệ thống tự parse + match + score confidence</Typography.Text>
        </Upload.Dragger>
      </Card>

      <Card>
        <div className="flex justify-between mb-3">
          <Space>
            <Button
              type={filter === 'ALL' ? 'primary' : 'default'}
              onClick={() => setFilter('ALL')}
            >
              Tất cả ({total})
            </Button>
            <Button
              type={filter === 'ISSUES' ? 'primary' : 'default'}
              danger={filter === 'ISSUES'}
              onClick={() => setFilter('ISSUES')}
            >
              Cần xử lý ({total - matched})
            </Button>
          </Space>
          <Space>
            <Tag color="green">MATCH {matched}</Tag>
            <Tag color="gold">AMOUNT_MISMATCH 1</Tag>
            <Tag color="red">MISSING_IN_SYSTEM 1</Tag>
            <Tag color="blue">POTENTIAL_DUP 1</Tag>
          </Space>
        </div>

        {rows.map((r) => (
          <ReconciliationRowCard key={r.id} row={r} />
        ))}
      </Card>
    </>
  );
}

function UploadsPanel() {
  return (
    <Card>
      <Table
        rowKey="id"
        dataSource={journalUploadsMock}
        pagination={false}
        columns={[
          { title: 'Nguồn', dataIndex: 'source', render: (v) => <Tag>{v}</Tag> },
          { title: 'Tên file', dataIndex: 'fileName', render: (v) => <code className="text-xs">{v}</code> },
          { title: 'Người upload', dataIndex: 'uploadedBy' },
          {
            title: 'Thời gian',
            dataIndex: 'uploadedAt',
            render: (v: string) => formatDateTime(v),
          },
          {
            title: 'Tiến độ',
            key: 'progress',
            render: (_, r) => {
              const pct = Math.round(((r.matched + r.mismatched) / r.totalRows) * 100);
              return <Progress percent={pct} size="small" style={{ width: 140 }} />;
            },
          },
          {
            title: 'Kết quả',
            key: 'stats',
            render: (_, r) => (
              <Space size="small">
                <Tag color="green">✓ {r.matched}</Tag>
                <Tag color="gold">⚠ {r.mismatched}</Tag>
                <Tag color="red">✗ {r.missingInSystem}</Tag>
              </Space>
            ),
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            render: (v) =>
              v === 'PROCESSING' ? (
                <Tag color="blue">Đang xử lý</Tag>
              ) : v === 'DONE' ? (
                <Tag color="green">Xong</Tag>
              ) : (
                <Tag color="red">Lỗi</Tag>
              ),
          },
          {
            title: '',
            key: 'actions',
            render: (_, r) =>
              r.status === 'DONE' ? <Button size="small" icon={<FileSearchOutlined />}>Xem chi tiết</Button> : null,
          },
        ]}
      />
    </Card>
  );
}

function LayerOverviewPanel() {
  return (
    <>
      <Alert
        type="info"
        showIcon
        className="mb-4"
        message="Đối chiếu 3 lớp theo §L quy trình"
        description="Lớp 1 chạy tự động sau mỗi giao dịch · Lớp 2 chạy khi đóng ca · Lớp 3 chạy cuối ngày toàn hệ thống."
      />
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Card title="Lớp 1: Sau giao dịch">
            <Statistic title="GD hôm nay đã đối chiếu" value="47 / 47" valueStyle={{ color: '#16a34a' }} />
            <Typography.Text type="secondary" className="block mt-2">
              Auto-check ngay sau khi tạo giao dịch. Chưa phát hiện bất thường.
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Lớp 2: Cuối ca">
            <Statistic title="Ca đã đối chiếu" value="4 / 5" valueStyle={{ color: '#d97706' }} />
            <Typography.Text type="secondary" className="block mt-2">
              CN Bảy Hiền chưa đóng ca. Còn 1 CN chờ.
            </Typography.Text>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Lớp 3: Toàn hệ thống">
            <Statistic title="Journals đã đối soát" value="2 / 3" valueStyle={{ color: '#2563eb' }} />
            <Typography.Text type="secondary" className="block mt-2">
              ACB statement đang xử lý. WU + MG đã xong.
            </Typography.Text>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export function ReconciliationPage() {
  return (
    <PageScaffold
      title="Đối chiếu"
      description="Đối chiếu 3 lớp: sau giao dịch · cuối ca · toàn hệ thống. Bao gồm Journal WU/MG, sao kê ngân hàng, quỹ và công nợ."
      moduleName="reconciliation"
    >
      <Tabs
        items={[
          { key: 'overview', label: 'Tổng quan 3 lớp', children: <LayerOverviewPanel /> },
          { key: 'journal',  label: 'Journal WU/MG',   children: <JournalReconciliationPanel /> },
          { key: 'uploads',  label: 'Lịch sử upload',  children: <UploadsPanel /> },
        ]}
      />
    </PageScaffold>
  );
}
