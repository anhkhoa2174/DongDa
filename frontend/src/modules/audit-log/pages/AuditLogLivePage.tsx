// Flow 6b — Đọc Audit Log (nối API thật, chỉ GĐ/KTTH/Auditor)
import { useState } from 'react';
import { Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuditLogs } from '../hooks/useAuditLogs';
import type { AuditLogDto } from '../api/auditLog.api';

const ENTITY_TYPES = ['exchange-rates', 'debts', 'fund', 'wu', 'mg', 'fx', 'bank', 'reconciliation', 'users', 'auth'];

const methodColor = (action: string) =>
  action.startsWith('POST') ? 'green' : action.startsWith('PATCH') ? 'blue' : action.startsWith('DELETE') ? 'red' : 'default';

export function AuditLogLivePage() {
  const [entityType, setEntityType] = useState<string | undefined>();
  const [action, setAction] = useState<string>('');
  const { data: logs = [], isLoading } = useAuditLogs({ entityType, action: action || undefined });

  const columns: ColumnsType<AuditLogDto> = [
    { title: 'Thời gian', dataIndex: 'createdAt', width: 160,
      render: (v) => new Date(v).toLocaleString('vi-VN') },
    { title: 'Hành động', dataIndex: 'action',
      render: (v) => <Tag color={methodColor(v)}>{v.replace('/api/v1', '')}</Tag> },
    { title: 'Đối tượng', dataIndex: 'entityType', render: (v) => <Tag>{v}</Tag> },
    { title: 'User', dataIndex: 'userId', render: (v) => v ? <Typography.Text code>{v.slice(0, 8)}</Typography.Text> : <Tag>ẩn danh</Tag> },
    { title: 'IP', dataIndex: 'ipAddress', render: (v) => v ?? '—' },
  ];

  return (
    <PageScaffold
      title="Audit Log — Nhật ký hệ thống"
      description="Mọi thao tác ghi đều được ghi lại append-only (không sửa/xóa). Chỉ GĐ/KTTH/Auditor xem được."
      moduleName="audit-log"
    >
      <Card size="small" className="mb-4">
        <Space wrap>
          <Select allowClear placeholder="Lọc theo đối tượng" style={{ width: 200 }}
            value={entityType} onChange={setEntityType}
            options={ENTITY_TYPES.map((v) => ({ value: v, label: v }))} />
          <Input.Search placeholder="Tìm hành động (login, exchange...)" style={{ width: 260 }}
            allowClear onSearch={setAction} />
        </Space>
      </Card>

      <Card size="small">
        <Table<AuditLogDto>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={logs}
          pagination={{ pageSize: 15 }}
          scroll={{ x: 800 }}
          expandable={{
            expandedRowRender: (r) => (
              <pre className="text-xs overflow-auto">
                {JSON.stringify(r.afterData ?? {}, null, 2)}
              </pre>
            ),
            rowExpandable: (r) => !!r.afterData,
          }}
        />
      </Card>
    </PageScaffold>
  );
}
