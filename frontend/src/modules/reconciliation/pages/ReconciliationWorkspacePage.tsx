// Flow Đối chiếu Journal (diagram 4) — nối API thật
import { useEffect, useMemo, useState } from 'react';
import {
  App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Progress, Row, Segmented, Select, Space, Table, Tag, Typography, Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CloseCircleOutlined, MinusCircleOutlined, PlusOutlined, PlayCircleOutlined, SendOutlined, UploadOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  useReconItems, useReconRuns, useRunReconciliation, useParseJournal,
  usePendingJournals, usePendingJournalDetail, useSubmitPendingJournal, useRejectPendingJournal,
} from '../hooks/useReconciliation';
import type { JournalRowInput, ReconItemDto, ReconRunDto, PendingJournalDto } from '../api/reconciliation.api';
import { useBranches } from '@/shared/hooks/useBranches';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatNumber } from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';

const money = (n: number) => formatNumber(n, 2);

const ITEM_STATUS: Record<string, { color: string; label: string }> = {
  MATCHED: { color: 'green', label: 'Khớp' },
  AMOUNT_VARIANCE: { color: 'orange', label: 'Lệch số tiền' },
  MISSING_IN_SYSTEM: { color: 'red', label: 'Thiếu ở hệ thống' },
  MISSING_IN_JOURNAL: { color: 'volcano', label: 'Thiếu ở Journal' },
};

interface ReconciliationFormValues {
  provider: 'WU' | 'MG';
  businessDate: Dayjs;
  branchId?: string;
  rows: JournalRowInput[];
}

export function ReconciliationWorkspacePage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  // Chi nhánh: chỉ upload/đối chiếu/xem cho chính mình. GĐ/KTTH/kiểm toán: toàn công ty hoặc lọc từng chi nhánh.
  const isBranchUser = user?.role === 'branch';
  const ownBranchId = isBranchUser ? user?.branchId : undefined;
  const canRun = user?.role !== 'auditor';
  const [historyBranchId, setHistoryBranchId] = useState<string | undefined>(undefined);
  const { data: runs = [] } = useReconRuns(ownBranchId ?? historyBranchId);
  const run = useRunReconciliation();
  const parse = useParseJournal();
  const { data: branches = [] } = useBranches();
  const [form] = Form.useForm<ReconciliationFormValues>();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: items = [] } = useReconItems(selectedRun);
  // DongDav6 — luồng 2 bước: chi nhánh gửi Journal về KTTH (pending) -> KTTH xem, chạy đối chiếu (duyệt) hoặc từ chối
  const submitPending = useSubmitPendingJournal();
  const rejectPending = useRejectPendingJournal();
  const { data: pendingJournals = [] } = usePendingJournals(ownBranchId ?? historyBranchId);
  const [viewingPending, setViewingPending] = useState<string | null>(null);
  const { data: pendingDetail } = usePendingJournalDetail(viewingPending);
  const [loadedPendingId, setLoadedPendingId] = useState<string | null>(null);
  const branchOptions = useMemo(
    () => branches
      .filter((branch) => branch.type !== 'HEAD_OFFICE')
      .map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` })),
    [branches],
  );
  const branchLabel = (branchId?: string | null) => {
    if (!branchId) return null;
    const branch = branches.find((b) => b.id === branchId);
    return branch ? `${branch.code} - ${branch.name}` : branchId.slice(0, 8);
  };
  const isBranchScopedForm = (values: Partial<ReconciliationFormValues>) => Boolean(ownBranchId ?? values.branchId);

  useEffect(() => {
    if (ownBranchId) form.setFieldValue('branchId', ownBranchId);
  }, [form, ownBranchId]);

  // Upload file WU/MG Journal -> parse -> đổ vào danh sách dòng để KTTH rà lại.
  const onUploadJournal = async (file: File) => {
    const provider = form.getFieldValue('provider') as 'WU' | 'MG';
    try {
      const res = await parse.mutateAsync({ provider, file });
      form.setFieldsValue({
        rows: res.rows.map((r) => ({ code: r.code, amount: r.amount, currencyCode: r.currencyCode, customerName: r.customerName })),
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
      if (provider === 'MG' && res.rows.length && !isBranchScopedForm(form.getFieldsValue())) {
        message.info('Journal MG toàn công ty: chọn chi nhánh cho từng dòng (hoặc chọn 1 chi nhánh ở đầu form) trước khi chạy đối chiếu');
      }
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Đọc file thất bại'));
    }
    return false; // chặn antd tự upload
  };

  // Chi nhánh: gửi các dòng đã rà về KTTH duyệt thay vì tự chạy đối chiếu
  const onSubmitPending = async () => {
    const v = await form.validateFields();
    const branchId = ownBranchId ?? v.branchId;
    const rows = (v.rows ?? [])
      .filter((row) => row?.code && row?.amount != null)
      .map((row) => ({ ...row, customerName: row.customerName?.trim() || undefined, branchId: branchId ?? row.branchId }));
    if (rows.length === 0) return message.warning('Thêm ít nhất 1 dòng Journal');
    if (!branchId) return message.warning('Gửi KTTH duyệt phải chọn chi nhánh');
    try {
      const res = await submitPending.mutateAsync({ provider: v.provider, businessDate: v.businessDate.format('YYYY-MM-DD'), branchId, rows });
      message.success(`Đã gửi ${res.parsedRowCount} dòng Journal ${res.provider} về KTTH duyệt (${res.runNo})`);
      form.setFieldsValue({ rows: [{ currencyCode: 'USD' }] });
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Gửi Journal thất bại'));
    }
  };

  // KTTH: nạp các dòng của Journal chờ duyệt vào form để chạy đối chiếu (= duyệt)
  const loadPendingIntoForm = () => {
    if (!pendingDetail) return;
    const { summary, rows } = pendingDetail;
    form.setFieldsValue({
      provider: summary.provider,
      businessDate: dayjs(summary.businessDate),
      branchId: summary.branchId ?? undefined,
      rows: rows.map((r) => ({ code: r.code, amount: r.amount, currencyCode: r.currencyCode, customerName: r.customerName ?? undefined, branchId: r.branchId ?? undefined })),
    });
    setLoadedPendingId(summary.id);
    setViewingPending(null);
    message.info('Đã nạp dòng Journal vào form — bấm "Chạy đối chiếu" để duyệt');
  };

  const onRejectPending = async (p: PendingJournalDto) => {
    try {
      await rejectPending.mutateAsync({ id: p.id });
      message.success(`Đã từ chối ${p.runNo}`);
      if (viewingPending === p.id) setViewingPending(null);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Từ chối thất bại'));
    }
  };

  const onRun = async (v: ReconciliationFormValues) => {
    const branchId = ownBranchId ?? v.branchId;
    const rows = (v.rows ?? [])
      .filter((row) => row?.code && row?.amount != null)
      .map((row) => ({
        ...row,
        customerName: row.customerName?.trim() || undefined,
        // Có chi nhánh ở đầu form -> mọi dòng thuộc chi nhánh đó, bỏ chọn theo dòng.
        branchId: branchId ?? row.branchId,
      }));
    if (rows.length === 0) return message.warning('Thêm ít nhất 1 dòng Journal');
    if (v.provider === 'MG' && !branchId && rows.some((row) => !row.branchId)) {
      return message.warning('Journal MG toàn công ty: chọn chi nhánh cho từng dòng, hoặc chọn 1 chi nhánh ở đầu form');
    }
    // Journal WU/MG có thể lẫn USD và VND, nhưng mỗi lần đối chiếu chỉ 1 loại tiền
    // -> tự gom theo loại tiền và chạy lần lượt từng loại.
    const byCurrency = new Map<string, JournalRowInput[]>();
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
          branchId,
          rows: curRows,
          pendingJournalId: loadedPendingId ?? undefined,
        });
        lastRunId = res.id;
        summaries.push(`${cur}: khớp ${(res.matchRate * 100).toFixed(0)}% (${curRows.length} dòng)`);
      }
      if (lastRunId) setSelectedRun(lastRunId);
      setLoadedPendingId(null);
      message.success(`Đối chiếu xong — ${summaries.join(' · ')}`);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Đối chiếu thất bại'));
    }
  };

  const runCols: ColumnsType<ReconRunDto> = [
    { title: 'Mã', dataIndex: 'runNo', render: (v) => <Typography.Text copyable={{ text: v }}>{v.slice(0, 14)}…</Typography.Text> },
    { title: 'Đối tác', dataIndex: 'provider', render: (v) => <Tag>{v}</Tag> },
    { title: 'Ngày', dataIndex: 'businessDate', render: (v) => dayjs(v).format('DD/MM') },
    { title: 'Chi nhánh', dataIndex: 'branchId', ellipsis: true,
      render: (v, r) => v ? (r.branchCode ?? branchLabel(v)) : <Tag color="blue">Toàn Cty</Tag> },
    { title: 'Match', dataIndex: 'matchRate',
      render: (v, r) => <Progress percent={Math.round(v * 100)} size="small" style={{ width: 90 }}
        status={v >= 0.95 ? 'success' : 'exception'} format={() => `${r.matchedCount}/${r.totalCount}`} /> },
    { title: 'Lệch tổng', dataIndex: 'varianceTotal', align: 'right', render: (v) => `${money(v)}` },
    { title: '', render: (_, r) => <Button size="small" onClick={() => setSelectedRun(r.id)}>Xem</Button> },
  ];

  const itemCols: ColumnsType<ReconItemDto> = [
    { title: 'Mã', dataIndex: 'code' },
    { title: 'Khách hàng', dataIndex: 'customerName', ellipsis: true,
      render: (v) => v || <Typography.Text type="secondary">—</Typography.Text> },
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
      description={isBranchUser
        ? 'Upload Journal WU/MG cuối ngày của chi nhánh → hệ thống so khớp với giao dịch đã ghi. GĐ/KTTH sẽ xem kết quả này.'
        : 'Nhập/upload các dòng Journal cuối ngày (MSKH/Reference + tên khách + số tiền) → so khớp với giao dịch đã ghi; xem theo toàn công ty hoặc từng chi nhánh.'}
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
                {({ getFieldValue }) => {
                  const isWu = getFieldValue('provider') === 'WU';
                  if (ownBranchId) {
                    return (
                      <Form.Item label="Chi nhánh">
                        <Input value={branchLabel(ownBranchId) ?? user?.branchName ?? ''} disabled />
                        <Form.Item name="branchId" hidden><Input /></Form.Item>
                      </Form.Item>
                    );
                  }
                  return (
                    <Form.Item
                      name="branchId"
                      label={isWu ? 'Chi nhánh WU' : 'Chi nhánh MG (bỏ trống = toàn công ty)'}
                      rules={isWu ? [{ required: true, message: 'Chọn chi nhánh' }] : undefined}
                    >
                      <Select allowClear={!isWu} placeholder={isWu ? 'Chọn chi nhánh' : 'Toàn công ty'} options={branchOptions} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
              <div className="flex items-center justify-between mb-1">
                <Typography.Text type="secondary">Dòng Journal (mã + tên khách + số tiền):</Typography.Text>
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
                          <Input placeholder="MSKH / Reference" style={{ width: 150 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'customerName']} noStyle>
                          <Input placeholder="Tên khách hàng" style={{ width: 170 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'amount']} rules={[{ required: true, message: 'USD' }]} noStyle>
                          <InputNumber placeholder="USD" min={0} style={{ width: 110 }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'currencyCode']} initialValue="USD" noStyle>
                          <Select style={{ width: 82 }} options={[{ value: 'USD' }, { value: 'VND' }]} />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, next) => prev.provider !== next.provider || prev.branchId !== next.branchId}>
                          {({ getFieldValue }) => getFieldValue('provider') === 'MG' && !ownBranchId && !getFieldValue('branchId') ? (
                            <Form.Item {...rest} name={[name, 'branchId']} rules={[{ required: true, message: 'Chi nhánh' }]} noStyle>
                              <Select placeholder="Chi nhánh" style={{ width: 160 }} options={branchOptions.map((o) => ({ value: o.value, label: o.label.split(' - ')[1] ?? o.label }))} />
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
              <Space direction="vertical" className="w-full mt-3" size={8}>
                {loadedPendingId && <Tag color="gold">Đang duyệt Journal chi nhánh gửi — chạy đối chiếu sẽ đánh dấu đã duyệt</Tag>}
                <Button type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={run.isPending} block disabled={!canRun}>
                  {isBranchUser ? 'Tự chạy đối chiếu tại chi nhánh' : loadedPendingId ? 'Chạy đối chiếu & duyệt' : 'Chạy đối chiếu'}
                </Button>
                {canRun && (
                  <Button icon={<SendOutlined />} loading={submitPending.isPending} block onClick={onSubmitPending}
                    style={isBranchUser ? { background: '#111', color: '#f5b301', borderColor: '#111' } : undefined}>
                    Gửi KTTH duyệt
                  </Button>
                )}
              </Space>
            </Form>
          </Card>
          <Card
            title={`Journal chờ duyệt (${pendingJournals.length})`}
            size="small"
            className="mb-4"
          >
            <Table<PendingJournalDto>
              rowKey="id" size="small" dataSource={pendingJournals} pagination={{ pageSize: 5, hideOnSinglePage: true }} scroll={{ x: 520 }}
              locale={{ emptyText: isBranchUser ? 'Chưa gửi Journal nào' : 'Không có Journal chờ duyệt' }}
              columns={[
                { title: 'Ngày', dataIndex: 'businessDate', width: 90, render: (v: string) => dayjs(v).format('DD/MM') },
                { title: 'Đối tác', dataIndex: 'provider', width: 70, render: (v: string) => <Tag>{v}</Tag> },
                { title: 'Chi nhánh', dataIndex: 'branchName', ellipsis: true },
                { title: 'Dòng', dataIndex: 'parsedRowCount', width: 60, align: 'right' },
                { title: 'Gửi lúc', dataIndex: 'uploadedAt', width: 110, render: (v: string) => dayjs(v).format('DD/MM HH:mm') },
                {
                  title: '', width: isBranchUser ? 70 : 150,
                  render: (_: unknown, p: PendingJournalDto) => (
                    <Space size={4}>
                      <Button size="small" onClick={() => setViewingPending(p.id)}>Xem</Button>
                      {!isBranchUser && canRun && (
                        <Popconfirm title="Từ chối Journal này?" okText="Từ chối" cancelText="Hủy" onConfirm={() => onRejectPending(p)}>
                          <Button size="small" danger icon={<CloseCircleOutlined />} />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
          <Card
            title="Lịch sử đối chiếu"
            size="small"
            extra={!isBranchUser ? (
              <Select
                allowClear
                size="small"
                placeholder="Tất cả chi nhánh"
                style={{ width: 200 }}
                value={historyBranchId}
                onChange={(value) => setHistoryBranchId(value || undefined)}
                options={branchOptions}
              />
            ) : null}
          >
            <Table<ReconRunDto> rowKey="id" size="small" columns={runCols} dataSource={runs} pagination={{ pageSize: 5 }} scroll={{ x: 560 }} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={selectedRun ? 'Chi tiết đối chiếu' : 'Chọn 1 lần đối chiếu để xem chi tiết'} size="small">
            <Table<ReconItemDto> rowKey={(r) => r.code + r.status} columns={itemCols} dataSource={items}
              pagination={{ pageSize: 12 }} scroll={{ x: 640 }} />
          </Card>
        </Col>
      </Row>
      <Modal
        title={pendingDetail ? `Journal ${pendingDetail.summary.provider} · ${pendingDetail.summary.branchName ?? ''} · ${dayjs(pendingDetail.summary.businessDate).format('DD/MM/YYYY')}` : 'Journal chờ duyệt'}
        open={!!viewingPending}
        onCancel={() => setViewingPending(null)}
        width={720}
        footer={[
          <Button key="close" onClick={() => setViewingPending(null)}>Đóng</Button>,
          ...(!isBranchUser && canRun ? [
            <Button key="load" type="primary" icon={<PlayCircleOutlined />} onClick={loadPendingIntoForm} disabled={!pendingDetail}>
              Nạp vào form để đối chiếu
            </Button>,
          ] : []),
        ]}
      >
        <Table
          rowKey={(r) => r.code + r.currencyCode}
          size="small"
          dataSource={pendingDetail?.rows ?? []}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[
            { title: 'Mã', dataIndex: 'code' },
            { title: 'Khách hàng', dataIndex: 'customerName', ellipsis: true, render: (v: string | null) => v || '—' },
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: money },
            { title: 'Tiền', dataIndex: 'currencyCode', width: 70 },
          ]}
        />
      </Modal>
    </PageScaffold>
  );
}
