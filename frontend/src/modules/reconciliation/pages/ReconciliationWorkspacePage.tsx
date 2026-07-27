// Flow Đối chiếu Journal (diagram 4) — nối API thật
import { useState } from 'react';
import {
  App, Button, Card, Col, Form, Input, InputNumber, Progress, Row, Segmented, Space, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MinusCircleOutlined, PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useReconItems, useReconRuns, useRunReconciliation } from '../hooks/useReconciliation';
import type { ReconItemDto, ReconRunDto } from '../api/reconciliation.api';

const money = (n: number) => n.toLocaleString('vi-VN');

const ITEM_STATUS: Record<string, { color: string; label: string }> = {
  MATCHED: { color: 'green', label: 'Khớp' },
  AMOUNT_VARIANCE: { color: 'orange', label: 'Lệch số tiền' },
  MISSING_IN_SYSTEM: { color: 'red', label: 'Thiếu ở hệ thống' },
  MISSING_IN_JOURNAL: { color: 'volcano', label: 'Thiếu ở Journal' },
};

export function ReconciliationWorkspacePage() {
  const { message } = App.useApp();
  const { data: runs = [] } = useReconRuns();
  const run = useRunReconciliation();
  const [form] = Form.useForm();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: items = [] } = useReconItems(selectedRun);

  const onRun = async (v: any) => {
    const rows = (v.rows ?? []).filter((r: any) => r?.code && r?.amount != null);
    if (rows.length === 0) return message.warning('Thêm ít nhất 1 dòng Journal');
    try {
      const res = await run.mutateAsync({ provider: v.provider, rows });
      setSelectedRun(res.id);
      message.success(`Đối chiếu xong: khớp ${(res.matchRate * 100).toFixed(0)}%`);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Đối chiếu thất bại');
    }
  };

  const runCols: ColumnsType<ReconRunDto> = [
    { title: 'Mã', dataIndex: 'runNo', render: (v) => <Typography.Text copyable={{ text: v }}>{v.slice(0, 14)}…</Typography.Text> },
    { title: 'Provider', dataIndex: 'provider', render: (v) => <Tag>{v}</Tag> },
    { title: 'Match', dataIndex: 'matchRate',
      render: (v, r) => <Progress percent={Math.round(v * 100)} size="small" style={{ width: 90 }}
        status={v >= 0.95 ? 'success' : 'exception'} format={() => `${r.matchedCount}/${r.totalCount}`} /> },
    { title: 'Lệch tổng', dataIndex: 'varianceTotal', align: 'right', render: (v) => `${money(v)}` },
    { title: '', render: (_, r) => <Button size="small" onClick={() => setSelectedRun(r.id)}>Xem</Button> },
  ];

  const itemCols: ColumnsType<ReconItemDto> = [
    { title: 'Mã', dataIndex: 'code' },
    { title: 'Trạng thái', dataIndex: 'status',
      render: (s) => <Tag color={ITEM_STATUS[s]?.color}>{ITEM_STATUS[s]?.label ?? s}</Tag> },
    { title: 'Hệ thống', dataIndex: 'systemAmount', align: 'right', render: money },
    { title: 'Journal', dataIndex: 'journalAmount', align: 'right', render: money },
    { title: 'Lệch', dataIndex: 'varianceAmount', align: 'right',
      render: (v) => <Typography.Text type={v === 0 ? undefined : 'danger'}>{money(v)}</Typography.Text> },
  ];

  return (
    <PageScaffold
      title="Đối chiếu Journal WU/MG"
      description="Nhập các dòng Journal cuối ngày (MSKH/Reference + số USD) → hệ thống so khớp với giao dịch đã ghi."
      moduleName="reconciliation"
    >
      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="Chạy đối chiếu" size="small" className="mb-4">
            <Form form={form} layout="vertical" onFinish={onRun} initialValues={{ provider: 'WU', rows: [{}] }}>
              <Form.Item name="provider" label="Provider">
                <Segmented options={['WU', 'MG']} />
              </Form.Item>
              <Typography.Text type="secondary">Dòng Journal (mã + số USD):</Typography.Text>
              <Form.List name="rows">
                {(fields, { add, remove }) => (
                  <div className="mt-2">
                    {fields.map(({ key, name, ...rest }) => (
                      <Space key={key} align="baseline" className="flex mb-2">
                        <Form.Item {...rest} name={[name, 'code']} rules={[{ required: true, message: 'mã' }]} noStyle>
                          <Input placeholder="MSKH / Reference" style={{ width: 180 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'amount']} rules={[{ required: true, message: 'USD' }]} noStyle>
                          <InputNumber placeholder="USD" min={0} style={{ width: 110 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} block>Thêm dòng</Button>
                  </div>
                )}
              </Form.List>
              <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={run.isPending} block className="mt-3">
                Chạy đối chiếu
              </Button>
            </Form>
          </Card>
          <Card title="Lịch sử đối chiếu" size="small">
            <Table<ReconRunDto> rowKey="id" size="small" columns={runCols} dataSource={runs} pagination={{ pageSize: 5 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={selectedRun ? 'Chi tiết đối chiếu' : 'Chọn 1 lần đối chiếu để xem chi tiết'} size="small">
            <Table<ReconItemDto> rowKey={(r) => r.code + r.status} columns={itemCols} dataSource={items}
              pagination={{ pageSize: 12 }} scroll={{ x: 500 }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
