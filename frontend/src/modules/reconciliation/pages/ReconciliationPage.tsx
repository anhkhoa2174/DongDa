// F9.1 Đối chiếu quỹ + F9.7 Tổng hợp — tồn hệ thống (ledger) vs kiểm quỹ thực tế gần nhất.
import { useMemo, useState } from 'react';
import { Card, Col, Row, Select, Statistic, Table, Tag, Typography, Alert, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime } from '@/shared/utils/formatters';
import { useFundReconciliation } from '../hooks/useReconciliation';
import type { FundReconItemDto } from '../api/reconciliation.api';
import { useBranches } from '@/modules/western-union/hooks/useWu';

const money = (n: number) => n.toLocaleString('vi-VN');

const STATUS_META: Record<FundReconItemDto['status'], { color: string; label: string }> = {
  MATCH: { color: 'green', label: 'Khớp' },
  OVERAGE: { color: 'blue', label: 'Thừa' },
  SHORTAGE: { color: 'red', label: 'Thiếu' },
  NO_COUNT: { color: 'default', label: 'Chưa kiểm quỹ' },
};

export function ReconciliationPage() {
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const { data: branches = [] } = useBranches();
  const { data: items = [], isFetching, refetch } = useFundReconciliation(branchId);

  const summary = useMemo(() => {
    const match = items.filter((i) => i.status === 'MATCH').length;
    const shortage = items.filter((i) => i.status === 'SHORTAGE').length;
    const overage = items.filter((i) => i.status === 'OVERAGE').length;
    const noCount = items.filter((i) => i.status === 'NO_COUNT').length;
    // F9.7: trạng thái toàn hệ thống — có lệch tiền = ERROR, chưa kiểm = WARNING, còn lại MATCH
    const overall: 'ERROR' | 'WARNING' | 'MATCH' = shortage + overage > 0 ? 'ERROR' : noCount > 0 ? 'WARNING' : 'MATCH';
    return { match, shortage, overage, noCount, overall };
  }, [items]);

  const columns: ColumnsType<FundReconItemDto> = [
    { title: 'Chi nhánh', dataIndex: 'branchCode' },
    { title: 'Loại tiền', dataIndex: 'currencyCode' },
    { title: 'Tồn hệ thống', dataIndex: 'systemBalance', align: 'right', render: money },
    { title: 'Thực tế (kiểm quỹ)', dataIndex: 'physicalActual', align: 'right', render: (v) => (v == null ? '—' : money(v)) },
    {
      title: 'Chênh lệch', dataIndex: 'variance', align: 'right',
      render: (v: number) => <Typography.Text type={v === 0 ? undefined : 'danger'}>{v > 0 ? '+' : ''}{money(v)}</Typography.Text>,
    },
    { title: 'Kết quả', dataIndex: 'status', render: (s: FundReconItemDto['status']) => <Tag color={STATUS_META[s].color}>{STATUS_META[s].label}</Tag> },
    { title: 'Kiểm lúc', dataIndex: 'countedAt', render: (v) => (v ? formatDateTime(v) : '—') },
  ];

  const overallMeta = {
    MATCH: { type: 'success' as const, msg: 'Toàn hệ thống khớp — không có chênh lệch quỹ.' },
    WARNING: { type: 'warning' as const, msg: 'Có chi nhánh/loại tiền chưa kiểm quỹ — cần hoàn tất kiểm quỹ.' },
    ERROR: { type: 'error' as const, msg: 'Phát hiện chênh lệch quỹ (thừa/thiếu) — cần rà soát nguyên nhân.' },
  }[summary.overall];

  return (
    <PageScaffold
      title="Đối chiếu quỹ (F9.1)"
      description="So khớp tồn quỹ hệ thống (sổ ledger) với tồn thực tế lần kiểm quỹ gần nhất theo từng chi nhánh và loại tiền."
      moduleName="reconciliation"
    >
      <Row gutter={16} className="mb-4">
        <Col xs={12} md={6}><Card size="small"><Statistic title="Khớp" value={summary.match} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Thiếu" value={summary.shortage} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Thừa" value={summary.overage} valueStyle={{ color: '#096dd9' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Chưa kiểm" value={summary.noCount} /></Card></Col>
      </Row>

      <Alert type={overallMeta.type} showIcon message={overallMeta.msg} className="mb-4" />

      <Card
        size="small"
        title="Chi tiết đối chiếu quỹ"
        extra={
          <div className="flex items-center gap-2">
            <Select
              allowClear
              placeholder="Tất cả chi nhánh"
              style={{ width: 220 }}
              value={branchId}
              onChange={(v) => setBranchId(v)}
              options={branches.map((b) => ({ value: b.id, label: `${b.code} - ${b.name}` }))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>Làm mới</Button>
          </div>
        }
      >
        <Table<FundReconItemDto>
          rowKey={(r) => `${r.branchId}:${r.currencyCode}`}
          size="small"
          loading={isFetching}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 720 }}
        />
      </Card>
    </PageScaffold>
  );
}
