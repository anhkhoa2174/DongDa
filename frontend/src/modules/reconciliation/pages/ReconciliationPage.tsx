// F9.1 Đối chiếu quỹ + F9.7 Tổng hợp — tồn hệ thống (ledger) vs kiểm quỹ thực tế gần nhất.
import { useMemo, useState } from 'react';
import { Button, Card, Col, Modal, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime, formatNumber } from '@/shared/utils/formatters';
import { useFundReconciliation } from '../hooks/useReconciliation';
import type { FundReconLineDto, FundReconSheetDto } from '../api/reconciliation.api';
import { useBranches } from '@/shared/hooks/useBranches';

const quantity = (amount: number, currencyCode: string) => (
  `${formatNumber(amount, currencyCode === 'VND' ? 0 : 2)} ${currencyCode}`
);

const LINE_STATUS_META: Record<FundReconLineDto['status'], { color: string; label: string }> = {
  MATCH: { color: 'green', label: 'Khớp' },
  OVERAGE: { color: 'blue', label: 'Thừa' },
  SHORTAGE: { color: 'red', label: 'Thiếu' },
};

export function ReconciliationPage() {
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [selectedSheet, setSelectedSheet] = useState<FundReconSheetDto | null>(null);
  const { data: branches = [] } = useBranches();
  const { data: items = [], isFetching, refetch } = useFundReconciliation(branchId);

  const summary = useMemo(() => {
    const match = items.filter((item) => item.status === 'MATCH').length;
    const variance = items.filter((item) => item.status === 'VARIANCE').length;
    const checkedCurrencies = items.reduce((total, item) => total + item.lines.length, 0);
    return { total: items.length, match, variance, checkedCurrencies };
  }, [items]);

  const columns: ColumnsType<FundReconSheetDto> = [
    {
      title: 'Chi nhánh', key: 'branch',
      render: (_, record) => (
        <div>
          <Typography.Text strong className="block!">{record.branchCode}</Typography.Text>
          <Typography.Text type="secondary">{record.branchName}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Phiếu kiểm', key: 'sheet',
      render: (_, record) => (
        <div>
          <Space size={6} wrap>
            <Typography.Text strong>{record.shiftCode ?? `KQ-${record.id.slice(0, 8)}`}</Typography.Text>
            <Tag color={record.countType === 'OPENING' ? 'gold' : 'default'}>
              {record.countType === 'OPENING' ? 'Đầu ca' : 'Cuối ca'}
            </Tag>
          </Space>
          <Typography.Text type="secondary" className="block!">{record.note || 'Kiểm quỹ'}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Thời gian kiểm', key: 'countedAt',
      render: (_, record) => (
        <div>
          <Typography.Text className="block!">{formatDateTime(record.countedAt)}</Typography.Text>
          <Typography.Text type="secondary">{record.countedByName}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Loại tiền đã kiểm', dataIndex: 'lines', align: 'center', width: 150,
      render: (lines: FundReconLineDto[]) => lines.length,
    },
    {
      title: 'Kết quả', key: 'status', width: 150,
      render: (_, record) => record.status === 'MATCH'
        ? <Tag color="green">Khớp toàn bộ</Tag>
        : <Tag color="red">{record.varianceCount} loại tiền lệch</Tag>,
    },
    {
      title: '', key: 'action', width: 54, align: 'right',
      render: (_, record) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          title="Xem chi tiết phiếu kiểm"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedSheet(record);
          }}
        />
      ),
    },
  ];

  const lineColumns: ColumnsType<FundReconLineDto> = [
    { title: 'Loại tiền', dataIndex: 'currencyCode', width: 110 },
    {
      title: 'Số lượng hệ thống', dataIndex: 'systemBalance', align: 'right',
      render: (value, record) => quantity(Number(value), record.currencyCode),
    },
    {
      title: 'Số lượng thực đếm', dataIndex: 'physicalActual', align: 'right',
      render: (value, record) => quantity(Number(value), record.currencyCode),
    },
    {
      title: 'Chênh lệch', dataIndex: 'variance', align: 'right',
      render: (value, record) => (
        <Typography.Text type={Number(value) === 0 ? undefined : 'danger'}>
          {Number(value) > 0 ? '+' : ''}{quantity(Number(value), record.currencyCode)}
        </Typography.Text>
      ),
    },
    {
      title: 'Kết quả', dataIndex: 'status', width: 100,
      render: (status: FundReconLineDto['status']) => (
        <Tag color={LINE_STATUS_META[status].color}>{LINE_STATUS_META[status].label}</Tag>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Đối chiếu quỹ (F9.1)"
      description="Theo dõi toàn bộ phiếu kiểm quỹ đầu ca và cuối ca đã ghi sổ của các chi nhánh."
      moduleName="reconciliation"
    >
      <Row gutter={16} className="mb-4">
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng phiếu" value={summary.total} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Khớp toàn bộ" value={summary.match} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Có chênh lệch" value={summary.variance} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Loại tiền đã kiểm" value={summary.checkedCurrencies} /></Card></Col>
      </Row>

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
        <Table<FundReconSheetDto>
          rowKey="id"
          size="small"
          loading={isFetching}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 820 }}
          locale={{ emptyText: 'Chưa có phiếu kiểm quỹ nào' }}
          onRow={(record) => ({
            onClick: () => setSelectedSheet(record),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      <Modal
        title={selectedSheet
          ? `Kiểm quỹ ${selectedSheet.countType === 'OPENING' ? 'đầu ca' : 'cuối ca'} · ${selectedSheet.branchCode}`
          : 'Chi tiết kiểm quỹ'}
        open={Boolean(selectedSheet)}
        onCancel={() => setSelectedSheet(null)}
        footer={<Button onClick={() => setSelectedSheet(null)}>Đóng</Button>}
        width={860}
      >
        {selectedSheet && (
          <Space direction="vertical" size={16} className="w-full">
            <div className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              <Typography.Text><strong>Chi nhánh:</strong> {selectedSheet.branchCode} - {selectedSheet.branchName}</Typography.Text>
              <Typography.Text><strong>Ca:</strong> {selectedSheet.shiftCode ?? 'Không gắn ca'}</Typography.Text>
              <Typography.Text><strong>Người kiểm:</strong> {selectedSheet.countedByName}</Typography.Text>
              <Typography.Text><strong>Thời gian:</strong> {formatDateTime(selectedSheet.countedAt)}</Typography.Text>
              {selectedSheet.note && <Typography.Text className="sm:col-span-2"><strong>Ghi chú:</strong> {selectedSheet.note}</Typography.Text>}
            </div>
            <Table<FundReconLineDto>
              rowKey="currencyCode"
              size="small"
              pagination={false}
              columns={lineColumns}
              dataSource={selectedSheet.lines}
              scroll={{ x: 700 }}
            />
          </Space>
        )}
      </Modal>
    </PageScaffold>
  );
}
