// Flow Đối chiếu Journal (diagram 4) — nối API thật
import { useState } from 'react';
import {
  App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Progress, Row, Segmented, Select, Space, Table, Tag, Typography, Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MinusCircleOutlined, PlusOutlined, PlayCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useReconItems, useReconRuns, useRunReconciliation, useParseJournal } from '../hooks/useReconciliation';
import type { ReconItemDto, ReconRunDto } from '../api/reconciliation.api';
import { useBranches } from '@/modules/western-union/hooks/useWu';
import dayjs from 'dayjs';
import { formatNumber } from '@/shared/utils/formatters';

const money = (n: number) => formatNumber(n, 2);

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
  const parse = useParseJournal();
  const { data: branches = [] } = useBranches();
  const [form] = Form.useForm();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: items = [] } = useReconItems(selectedRun);

  // Upload file WU/MG Journal -> parse -> đổ vào danh sách dòng để KTTH rà lại.
  const onUploadJournal = async (file: File) => {
    const provider = form.getFieldValue('provider') as 'WU' | 'MG';
    try {
      const res = await parse.mutateAsync({ provider, file });
      form.setFieldsValue({
        rows: res.rows.map((r) => ({ code: r.code, amount: r.amount, currencyCode: r.currencyCode })),
      });
      const isPdf = /\.pdf$/i.test(file.name);
      if (res.rows.length === 0) {
        message.warning('File không có dòng hợp lệ nào');
      } else {
        message.success(`Đọc ${res.rows.length} dòng từ "${res.fileName}"${res.errors.length ? `, ${res.errors.length} dòng lỗi` : ''}`);
      }
      if (isPdf) {
        message.warning('File PDF được đọc bằng OCR — vui lòng đối chiếu lại với file gốc và sửa các dòng sai/thiếu trước khi chạy đối chiếu.', 8);
      }
      if (res.errors.length) {
        message.warning(`Dòng lỗi: ${res.errors.slice(0, 5).map((e) => `#${e.rowNo} ${e.message}`).join('; ')}${res.errors.length > 5 ? '…' : ''}`, 6);
      }
      if (provider === 'MG' && res.rows.length) {
        message.info('Journal MG: vui lòng chọn chi nhánh cho từng dòng trước khi chạy đối chiếu');
      }
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Đọc file thất bại');
    }
    return false; // chặn antd tự upload
  };

  const onRun = async (v: any) => {
    const rows = (v.rows ?? []).filter((r: any) => r?.code && r?.amount != null);
    if (rows.length === 0) return message.warning('Thêm ít nhất 1 dòng Journal');
    // Journal WU/MG có thể lẫn USD và VND, nhưng mỗi lần đối chiếu chỉ 1 loại tiền
    // -> tự gom theo loại tiền và chạy lần lượt từng loại.
    const byCurrency = new Map<string, any[]>();
    for (const r of rows) {
      const cur = r.currencyCode ?? 'USD';
      if (!byCurrency.has(cur)) byCurrency.set(cur, []);
      byCurrency.get(cur)!.push(r);
    }
    try {
      let lastRunId: string | null = null;
      const summaries: string[] = [];
      for (const [cur, curRows] of byCurrency) {
        const res = await run.mutateAsync({
          provider: v.provider,
          businessDate: v.businessDate.format('YYYY-MM-DD'),
          branchId: v.branchId,
          rows: curRows,
        });
        lastRunId = res.id;
        summaries.push(`${cur}: khớp ${(res.matchRate * 100).toFixed(0)}% (${curRows.length} dòng)`);
      }
      if (lastRunId) setSelectedRun(lastRunId);
      message.success(`Đối chiếu xong — ${summaries.join(' · ')}`);
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Đối chiếu thất bại');
    }
  };

  const runCols: ColumnsType<ReconRunDto> = [
    { title: 'Mã', dataIndex: 'runNo', render: (v) => <Typography.Text copyable={{ text: v }}>{v.slice(0, 14)}…</Typography.Text> },
    { title: 'Đối tác', dataIndex: 'provider', render: (v) => <Tag>{v}</Tag> },
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
            <Form form={form} layout="vertical" onFinish={onRun} initialValues={{ provider: 'WU', businessDate: dayjs(), rows: [{ currencyCode: 'USD' }] }}>
              <Form.Item name="provider" label="Đối tác">
                <Segmented options={['WU', 'MG']} />
              </Form.Item>
              <Form.Item name="businessDate" label="Ngày nghiệp vụ" rules={[{ required: true }]}>
                <DatePicker className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, next) => prev.provider !== next.provider}>
                {({ getFieldValue }) => getFieldValue('provider') === 'WU' ? (
                  <Form.Item name="branchId" label="Chi nhánh WU" rules={[{ required: true, message: 'Chọn chi nhánh' }]}>
                    <Select options={branches.map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` }))} />
                  </Form.Item>
                ) : null}
              </Form.Item>
              <div className="flex items-center justify-between mb-1">
                <Typography.Text type="secondary">Dòng Journal (mã + số USD):</Typography.Text>
                <Upload
                  accept=".pdf,.csv,.xlsx,.xls"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => onUploadJournal(file as unknown as File)}
                >
                  <Button size="small" icon={<UploadOutlined />} loading={parse.isPending}>
                    Upload Journal (PDF/Excel/CSV)
                  </Button>
                </Upload>
              </div>
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
                        <Form.Item {...rest} name={[name, 'currencyCode']} initialValue="USD" noStyle>
                          <Select style={{ width: 82 }} options={[{ value: 'USD' }, { value: 'VND' }]} />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, next) => prev.provider !== next.provider}>
                          {({ getFieldValue }) => getFieldValue('provider') === 'MG' ? (
                            <Form.Item {...rest} name={[name, 'branchId']} rules={[{ required: true, message: 'Chi nhánh' }]} noStyle>
                              <Select placeholder="Chi nhánh" style={{ width: 160 }} options={branches.map((branch) => ({ value: branch.id, label: branch.name }))} />
                            </Form.Item>
                          ) : null}
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ currencyCode: 'USD' })} icon={<PlusOutlined />} block>Thêm dòng</Button>
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
