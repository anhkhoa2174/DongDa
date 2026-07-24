import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatVnd } from '@/shared/utils/formatters';
import { centralAuditMock } from '../data/cashCount.mock';

const statusMeta = {
  MATCHED:  { label: 'Khớp',           color: 'green', icon: <CheckCircleOutlined /> },
  PENDING:  { label: 'Chờ đối chiếu',  color: 'blue',  icon: <ClockCircleOutlined /> },
  MISMATCH: { label: 'Lệch',           color: 'red',   icon: <ExclamationCircleOutlined /> },
} as const;

export function CentralAuditPage() {
  const stats = useMemo(() => {
    const matched  = centralAuditMock.filter((r) => r.status === 'MATCHED').length;
    const pending  = centralAuditMock.filter((r) => r.status === 'PENDING').length;
    const mismatch = centralAuditMock.filter((r) => r.status === 'MISMATCH').length;
    const totalGap = centralAuditMock.reduce((s, r) => s + Math.abs(r.gap), 0);
    return { matched, pending, mismatch, totalGap };
  }, []);

  return (
    <PageScaffold
      title="Kiểm quỹ tổng"
      description="KTTH đối soát tổng quỹ báo cáo từ các chi nhánh với số kỳ vọng trung tâm sau mỗi ngày làm việc."
      moduleName="cash-count"
      extra={<Button icon={<ReloadOutlined />} type="primary">Chạy đối soát</Button>}
    >
      <Row gutter={16} className="mb-4">
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Khớp" value={stats.matched} suffix={`/ ${centralAuditMock.length}`} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Chờ đối soát" value={stats.pending} valueStyle={{ color: '#2563eb' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Có chênh lệch" value={stats.mismatch} valueStyle={{ color: '#dc2626' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Typography.Text type="secondary">Tổng chênh lệch tuyệt đối</Typography.Text>
            <Typography.Title level={4} className="m-0!">{formatVnd(stats.totalGap)}</Typography.Title>
          </Card>
        </Col>
      </Row>

      {stats.mismatch > 0 && (
        <Alert
          type="error"
          className="mb-4"
          showIcon
          message="Phát hiện chênh lệch quỹ tổng"
          description="Có 1+ chi nhánh có chênh lệch so với sổ trung tâm. Kiểm tra kỹ trước khi đóng ngày."
        />
      )}

      <Card>
        <Table
          rowKey="id"
          dataSource={centralAuditMock}
          pagination={false}
          columns={[
            { title: 'Chi nhánh', dataIndex: 'branchName' },
            {
              title: 'Sổ CN',
              dataIndex: 'reportedTotal',
              align: 'right',
              render: (v: number) => formatVnd(v),
            },
            {
              title: 'Kỳ vọng trung tâm',
              dataIndex: 'centralExpected',
              align: 'right',
              render: (v: number) => formatVnd(v),
            },
            {
              title: 'Chênh lệch',
              dataIndex: 'gap',
              align: 'right',
              render: (v: number) => {
                if (v === 0) return <Tag color="green">0</Tag>;
                return <Tag color={v > 0 ? 'gold' : 'red'}>{formatVnd(v)}</Tag>;
              },
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              render: (s: keyof typeof statusMeta) => {
                const m = statusMeta[s];
                return <Tag color={m.color} icon={m.icon}>{m.label}</Tag>;
              },
            },
            {
              title: '',
              key: 'actions',
              render: (_, row) =>
                row.status === 'MISMATCH' ? (
                  <Space>
                    <Button size="small">Xem chi tiết</Button>
                    <Button size="small" type="primary">Yêu cầu giải trình</Button>
                  </Space>
                ) : null,
            },
          ]}
        />
      </Card>
    </PageScaffold>
  );
}
