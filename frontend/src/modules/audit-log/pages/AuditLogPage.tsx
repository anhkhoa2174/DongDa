import { DownloadOutlined, LockOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, DatePicker, Input, Row, Select, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime } from '@/shared/utils/formatters';
import { actionColors, auditRecordsMock } from '../data/auditLog.mock';
import type { AuditAction, AuditEntity, AuditRecord } from '../data/auditLog.mock';

const actionOptions: { value: 'ALL' | AuditAction; label: string }[] = [
  { value: 'ALL', label: 'Tất cả action' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'VOID', label: 'Void' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'OPEN_SHIFT', label: 'Mở ca' },
  { value: 'CLOSE_SHIFT', label: 'Đóng ca' },
  { value: 'UPLOAD_JOURNAL', label: 'Upload Journal' },
];

const entityOptions: { value: 'ALL' | AuditEntity; label: string }[] = [
  { value: 'ALL', label: 'Tất cả entity' },
  { value: 'Transaction', label: 'Giao dịch' },
  { value: 'ExchangeRate', label: 'Tỷ giá' },
  { value: 'Shift', label: 'Ca làm việc' },
  { value: 'Transfer', label: 'Điều động' },
  { value: 'Session', label: 'Session' },
  { value: 'JournalUpload', label: 'Journal' },
];

export function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<'ALL' | AuditAction>('ALL');
  const [entity, setEntity] = useState<'ALL' | AuditEntity>('ALL');

  const filtered = useMemo(() => {
    return auditRecordsMock.filter((r) => {
      const matchSearch =
        !search ||
        r.userName.toLowerCase().includes(search.toLowerCase()) ||
        (r.entityId ?? '').toLowerCase().includes(search.toLowerCase()) ||
        r.ip.includes(search);
      const matchAction = action === 'ALL' || r.action === action;
      const matchEntity = entity === 'ALL' || r.entity === entity;
      return matchSearch && matchAction && matchEntity;
    });
  }, [search, action, entity]);

  return (
    <PageScaffold
      title="Audit log"
      description="Lịch sử mọi thao tác trong hệ thống — append-only, không cho sửa hoặc xóa."
      moduleName="audit-log"
      extra={<Button icon={<DownloadOutlined />}>Export CSV</Button>}
    >
      <Alert
        type="info"
        icon={<LockOutlined />}
        className="mb-4"
        message="Nhật ký bất biến"
        description="Mọi log lưu trữ tối thiểu 5 năm. Không thể sửa hay xóa. Ai cố thao tác trực tiếp lên DB sẽ được flag."
        showIcon
      />

      <Card className="mb-4">
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Input.Search
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Tìm user, entity ID, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} md={5}>
            <Select className="w-full" value={action} onChange={setAction} options={actionOptions} />
          </Col>
          <Col xs={12} md={5}>
            <Select className="w-full" value={entity} onChange={setEntity} options={entityOptions} />
          </Col>
          <Col xs={24} md={6}>
            <DatePicker.RangePicker className="w-full" />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table<AuditRecord>
          rowKey="id"
          dataSource={filtered}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: 'Thời gian',
              dataIndex: 'at',
              width: 180,
              render: (v: string) => (
                <code className="text-xs">{formatDateTime(v)}</code>
              ),
            },
            {
              title: 'User',
              key: 'user',
              render: (_, r) => (
                <div>
                  <div>{r.userName}</div>
                  <Typography.Text type="secondary" className="text-xs!">
                    <Tag>{r.role}</Tag> {r.ip}
                  </Typography.Text>
                </div>
              ),
            },
            {
              title: 'Action',
              dataIndex: 'action',
              render: (v: AuditAction) => <Tag color={actionColors[v]}>{v}</Tag>,
            },
            {
              title: 'Entity',
              key: 'entity',
              render: (_, r) => (
                <div>
                  <div>{r.entity}</div>
                  {r.entityId && (
                    <Typography.Text type="secondary">
                      <code className="text-xs">{r.entityId}</code>
                    </Typography.Text>
                  )}
                </div>
              ),
            },
            {
              title: 'Trước → Sau',
              key: 'diff',
              render: (_, r) => (
                <div className="text-xs">
                  {r.before && <div><Typography.Text type="secondary">Trước:</Typography.Text> {r.before}</div>}
                  {r.after && <div><Typography.Text type="secondary">Sau:</Typography.Text> {r.after}</div>}
                </div>
              ),
            },
            {
              title: '',
              key: 'actions',
              render: () => <Button size="small" type="link">Chi tiết</Button>,
            },
          ]}
        />
      </Card>
    </PageScaffold>
  );
}
