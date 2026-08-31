// Flow Đối chiếu Journal (diagram 4) — nối API thật
import { useEffect, useMemo, useState } from 'react';
import {
  App, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Progress, Row, Select, Space, Table, Tag, Tooltip, Typography, Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApartmentOutlined, CheckCircleOutlined, ClockCircleOutlined, FileSearchOutlined,
  HistoryOutlined, MinusCircleOutlined, PlusOutlined, PlayCircleOutlined, UploadOutlined,
} from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import {
  useReconItems, useReconRuns, useRunReconciliation, useParseJournal,
  useSubmittedBranchRuns, useCreateFinalRun,
} from '../hooks/useReconciliation';
import type { JournalRowInput, ReconItemDto, ReconRunDto } from '../api/reconciliation.api';
import { useBranches } from '@/shared/hooks/useBranches';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatNumber, numberInputFormatter, numberInputParser } from '@/shared/utils/formatters';
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

export function ReconciliationWorkspacePage({ provider }: { provider: 'WU' | 'MG' }) {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  // Chi nhánh: chỉ upload/đối chiếu/xem cho chính mình. GĐ/KTTH/kiểm toán: toàn công ty hoặc lọc từng chi nhánh.
  const isBranchUser = user?.role === 'branch';
  const ownBranchId = isBranchUser ? user?.branchId : undefined;
  const canRun = user?.role !== 'auditor';
  const runHistoryBranchId = isBranchUser ? ownBranchId : undefined;
  const { data: runs = [] } = useReconRuns(runHistoryBranchId, provider);
  const run = useRunReconciliation();
  const parse = useParseJournal();
  const { data: branches = [] } = useBranches();
  const [form] = Form.useForm<ReconciliationFormValues>();
  const journalRows = Form.useWatch('rows', form) ?? [];
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: items = [] } = useReconItems(selectedRun);
  const createFinal = useCreateFinalRun(provider);
  const { data: submittedBranchRuns = [] } = useSubmittedBranchRuns(provider, undefined, !isBranchUser);
  const [selectedBranchRunIds, setSelectedBranchRunIds] = useState<string[]>([]);
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
  useEffect(() => {
    form.setFieldValue('provider', provider);
    if (ownBranchId) form.setFieldValue('branchId', ownBranchId);
  }, [form, ownBranchId, provider]);

  useEffect(() => {
    setSelectedRun(null);
    setSelectedBranchRunIds([]);
  }, [provider]);

  // Upload file WU/MG Journal -> parse -> đổ vào danh sách dòng để KTTH rà lại.
  const onUploadJournal = async (file: File) => {
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
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Đọc file thất bại'));
    }
    return false; // chặn antd tự upload
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
    if (!branchId) return message.warning('Phải xác định chi nhánh đối chiếu');
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
          provider,
          businessDate: v.businessDate.format('YYYY-MM-DD'),
          branchId,
          rows: curRows,
        });
        lastRunId = res.id;
        summaries.push(`${cur}: khớp ${(res.matchRate * 100).toFixed(0)}% (${curRows.length} dòng)`);
      }
      if (lastRunId) setSelectedRun(lastRunId);
      message.success(`Đã đối chiếu ${provider} và gửi GĐ/KTTH — ${summaries.join(' · ')}`);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Đối chiếu thất bại'));
    }
  };

  const onCreateFinal = async () => {
    try {
      const finalRun = await createFinal.mutateAsync(selectedBranchRunIds);
      setSelectedBranchRunIds([]);
      setSelectedRun(finalRun.id);
      message.success(`Đã tạo bản đối chiếu ${provider} cuối ${finalRun.runNo}`);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Tạo bản đối chiếu cuối thất bại'));
    }
  };

  const runCols: ColumnsType<ReconRunDto> = [
    {
      title: 'Bản đối chiếu', key: 'identity',
      render: (_, row) => (
        <div className="min-w-0">
          <Typography.Text className="block! font-semibold!" ellipsis={{ tooltip: row.runNo }}>{row.runNo}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">
            {dayjs(row.businessDate).format('DD/MM/YYYY')} · {row.currencyCode}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Phạm vi', key: 'scope', responsive: ['md'], ellipsis: true,
      render: (_, row) => row.branchId
        ? (row.branchCode ?? branchLabel(row.branchId))
        : <Tag color="gold">Toàn công ty</Tag>,
    },
    {
      title: 'Kết quả', dataIndex: 'matchRate', width: 118,
      render: (value, row) => (
        <Progress
          percent={Math.round(value * 100)}
          size="small"
          status={value >= 1 ? 'success' : 'exception'}
          format={() => `${row.matchedCount}/${row.totalCount}`}
        />
      ),
    },
    {
      title: '', width: 42, align: 'right',
      render: (_, row) => (
        <Tooltip title="Xem chi tiết">
          <Button type="text" size="small" icon={<FileSearchOutlined />} onClick={() => setSelectedRun(row.id)} />
        </Tooltip>
      ),
    },
  ];

  const itemCols: ColumnsType<ReconItemDto> = [
    { title: provider === 'WU' ? 'MSKH / MTCN' : 'Reference', dataIndex: 'code', width: 150, ellipsis: true },
    { title: 'Khách hàng', dataIndex: 'customerName', ellipsis: true, responsive: ['lg'],
      render: (v) => v || <Typography.Text type="secondary">—</Typography.Text> },
    { title: 'Kết quả', dataIndex: 'status', width: 126,
      render: (s) => <Tag color={ITEM_STATUS[s]?.color}>{ITEM_STATUS[s]?.label ?? s}</Tag> },
    { title: 'Hệ thống', dataIndex: 'systemAmount', width: 118, align: 'right', render: money },
    { title: 'Journal', dataIndex: 'journalAmount', width: 118, align: 'right', render: money },
    { title: 'Chênh lệch', dataIndex: 'varianceAmount', width: 118, align: 'right',
      render: (v) => <Typography.Text strong type={v === 0 ? undefined : 'danger'}>{money(v)}</Typography.Text> },
  ];
  const selectedBranchRuns = submittedBranchRuns.filter((item) => selectedBranchRunIds.includes(item.id));
  const selectionAnchor = selectedBranchRuns[0];
  const visibleRuns = runs.filter((item) => item.stage === (isBranchUser ? 'BRANCH' : 'FINAL'));
  const selectedRunSummary = [...submittedBranchRuns, ...runs].find((item) => item.id === selectedRun);
  const matchedItems = items.filter((item) => item.status === 'MATCHED').length;
  const varianceItems = items.length - matchedItems;
  const latestRun = visibleRuns[0];

  return (
    <PageScaffold
      title={`Đối chiếu Journal ${provider}`}
      description={isBranchUser
        ? `Upload Journal ${provider}, tạo bản so sánh giao dịch hệ thống và tự động gửi GĐ/KTTH.`
        : `Chọn các bản ${provider} do chi nhánh gửi, kiểm tra lại và tạo bản đối chiếu cuối cùng.`}
      moduleName="reconciliation"
      extra={<Tag color="gold">{isBranchUser ? 'LỚP CHI NHÁNH' : 'LỚP TỔNG HỢP'}</Tag>}
    >
      <OperationalOverviewCard
        className="mt-4"
        eyebrow={isBranchUser ? 'ĐỐI CHIẾU CHI NHÁNH' : 'ĐỐI CHIẾU TOÀN HỆ THỐNG'}
        title={`Journal ${provider}`}
        icon={<FileSearchOutlined />}
        meta={isBranchUser ? (user?.branchName ?? branchLabel(ownBranchId) ?? 'Chi nhánh hiện tại') : 'GĐ/KTTH kiểm tra và chốt bản cuối'}
        aside={<Tag color={canRun ? 'gold' : 'default'}>{canRun ? 'ĐƯỢC THAO TÁC' : 'CHỈ XEM'}</Tag>}
        metrics={isBranchUser ? [
          { label: 'Dòng đã nhập', value: String(journalRows.filter((row) => row?.code).length), note: 'Journal đang chuẩn bị', icon: <UploadOutlined /> },
          { label: 'Bản đã gửi', value: String(visibleRuns.length), note: `Lịch sử ${provider}`, icon: <HistoryOutlined /> },
          { label: 'Lần gần nhất', value: latestRun ? `${latestRun.matchedCount}/${latestRun.totalCount}` : '—', note: latestRun ? dayjs(latestRun.businessDate).format('DD/MM/YYYY') : 'Chưa đối chiếu', icon: <CheckCircleOutlined /> },
        ] : [
          { label: 'Chờ tổng hợp', value: String(submittedBranchRuns.length), note: `Bản ${provider} từ chi nhánh`, icon: <ClockCircleOutlined /> },
          { label: 'Đang chọn', value: String(selectedBranchRunIds.length), note: 'Cùng ngày và loại tiền', icon: <ApartmentOutlined /> },
          { label: 'Bản cuối', value: String(visibleRuns.length), note: 'Đã tạo trên hệ thống', icon: <CheckCircleOutlined /> },
        ]}
      />

      <Row gutter={[16, 16]} className="mt-4">
        <Col xs={24} xl={isBranchUser ? 24 : 9}>
          {!isBranchUser ? (
            <Card
              title={<span className="section-card-title"><ClockCircleOutlined />Bản chi nhánh chờ tổng hợp</span>}
              size="small"
              className="polished-card reconciliation-panel"
              extra={canRun ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  disabled={selectedBranchRunIds.length === 0}
                  loading={createFinal.isPending}
                  onClick={onCreateFinal}
                >
                  Chốt bản cuối ({selectedBranchRunIds.length})
                </Button>
              ) : null}
            >
              <Table<ReconRunDto>
                rowKey="id"
                size="small"
                dataSource={submittedBranchRuns}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Không có bản ${provider} chờ tổng hợp`} /> }}
                pagination={{ pageSize: 7, size: 'small', hideOnSinglePage: true }}
                rowSelection={{
                  selectedRowKeys: selectedBranchRunIds,
                  onChange: (keys) => setSelectedBranchRunIds(keys as string[]),
                  getCheckboxProps: (record) => {
                    if (!canRun) return { disabled: true };
                    if (!selectionAnchor || selectedBranchRunIds.includes(record.id)) return { disabled: false };
                    const sameDate = dayjs(record.businessDate).isSame(dayjs(selectionAnchor.businessDate), 'day');
                    const sameCurrency = record.currencyCode === selectionAnchor.currencyCode;
                    const duplicateBranch = selectedBranchRuns.some((item) => item.branchId === record.branchId);
                    return { disabled: !sameDate || !sameCurrency || duplicateBranch };
                  },
                }}
                rowClassName={(record) => record.id === selectedRun ? 'reconciliation-row--active' : ''}
                onRow={(record) => ({ onClick: () => setSelectedRun(record.id) })}
                columns={[
                  {
                    title: 'Chi nhánh', key: 'branch', ellipsis: true,
                    render: (_, row) => (
                      <div className="min-w-0">
                        <Typography.Text className="block! font-semibold!" ellipsis={{ tooltip: row.branchName }}>{row.branchName ?? row.branchCode ?? '—'}</Typography.Text>
                        <Typography.Text type="secondary" className="text-xs!">{dayjs(row.businessDate).format('DD/MM/YYYY')} · {row.currencyCode}</Typography.Text>
                      </div>
                    ),
                  },
                  {
                    title: 'Kết quả', width: 92,
                    render: (_, row) => <Tag color={row.matchedCount === row.totalCount ? 'green' : 'orange'}>{row.matchedCount}/{row.totalCount} khớp</Tag>,
                  },
                  { title: '', width: 38, align: 'right', render: (_, row) => <Button type="text" size="small" icon={<FileSearchOutlined />} onClick={() => setSelectedRun(row.id)} /> },
                ]}
              />
              {selectionAnchor && (
                <div className="reconciliation-selection-summary">
                  <Typography.Text type="secondary">Phạm vi đang chọn</Typography.Text>
                  <Space size={4} wrap>
                    <Tag>{dayjs(selectionAnchor.businessDate).format('DD/MM/YYYY')}</Tag>
                    <Tag>{selectionAnchor.currencyCode}</Tag>
                    <Tag color="gold">{selectedBranchRunIds.length} chi nhánh</Tag>
                  </Space>
                </div>
              )}
            </Card>
          ) : (
            <Card
              title={<span className="section-card-title"><UploadOutlined />Chuẩn bị Journal {provider}</span>}
              size="small"
              className="polished-card reconciliation-panel"
            >
              <Form form={form} layout="vertical" onFinish={onRun} initialValues={{ provider, businessDate: dayjs(), rows: [{ currencyCode: 'USD' }] }}>
                <Form.Item name="provider" hidden><Input /></Form.Item>
                <Row gutter={12}>
                  <Col xs={24} md={10}>
                    <Form.Item name="businessDate" label="Ngày nghiệp vụ" rules={[{ required: true }]}>
                      <DatePicker className="w-full" format="DD/MM/YYYY" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={14}>
                    {ownBranchId ? (
                      <Form.Item label="Chi nhánh">
                        <Input value={branchLabel(ownBranchId) ?? user?.branchName ?? ''} disabled />
                        <Form.Item name="branchId" hidden><Input /></Form.Item>
                      </Form.Item>
                    ) : (
                      <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true, message: 'Chọn chi nhánh' }]}>
                        <Select placeholder="Chọn chi nhánh" options={branchOptions} />
                      </Form.Item>
                    )}
                  </Col>
                </Row>

                <div className="reconciliation-upload-bar">
                  <div className="min-w-0">
                    <Typography.Text className="block! font-semibold!">Dữ liệu Journal</Typography.Text>
                    <Typography.Text type="secondary" className="text-xs!">PDF, Excel hoặc CSV · {journalRows.length} dòng</Typography.Text>
                  </div>
                  <Upload
                    accept=".pdf,.csv,.xlsx,.xls"
                    maxCount={1}
                    showUploadList={false}
                    beforeUpload={(file) => onUploadJournal(file as unknown as File)}
                  >
                    <Button icon={<UploadOutlined />} loading={parse.isPending}>Chọn file</Button>
                  </Upload>
                </div>

                <Form.List name="rows">
                  {(fields, { add, remove }) => (
                    <div className="reconciliation-entry-list">
                      {fields.map(({ key, name, ...rest }) => (
                        <div key={key} className="reconciliation-entry-card">
                          <div className="reconciliation-entry-card__header">
                            <Typography.Text strong>Giao dịch {name + 1}</Typography.Text>
                            <Tooltip title="Xóa giao dịch">
                              <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} />
                            </Tooltip>
                          </div>
                          <div className="reconciliation-entry-fields">
                            <Form.Item
                              {...rest}
                              name={[name, 'code']}
                              label={provider === 'WU' ? 'MSKH / MTCN' : 'Reference'}
                              rules={[{ required: true, message: 'Nhập mã' }]}
                            >
                              <Input placeholder={provider === 'WU' ? '633-775-1692' : 'Reference MG'} />
                            </Form.Item>
                            <Form.Item {...rest} name={[name, 'customerName']} label="Khách hàng">
                              <Input placeholder="Tên khách hàng" />
                            </Form.Item>
                            <Form.Item {...rest} name={[name, 'amount']} label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                              <InputNumber placeholder="0" min={0} precision={2} formatter={numberInputFormatter} parser={numberInputParser} className="w-full" />
                            </Form.Item>
                            <Form.Item {...rest} name={[name, 'currencyCode']} label="Loại tiền" initialValue="USD">
                              <Select options={[{ value: 'USD' }, { value: 'VND' }]} />
                            </Form.Item>
                          </div>
                        </div>
                      ))}
                      <Button type="dashed" onClick={() => add({ currencyCode: 'USD' })} icon={<PlusOutlined />} block>Thêm dòng Journal</Button>
                    </div>
                  )}
                </Form.List>
                <Button className="mt-3" type="primary" htmlType="submit" icon={<PlayCircleOutlined />} loading={run.isPending} block disabled={!canRun}>
                  Đối chiếu và gửi GĐ/KTTH
                </Button>
              </Form>
            </Card>
          )}
        </Col>

        <Col xs={24} xl={isBranchUser ? 24 : 15}>
          <Card
            title={<span className="section-card-title"><FileSearchOutlined />Chi tiết đối chiếu</span>}
            size="small"
            className="polished-card reconciliation-panel"
            extra={selectedRunSummary ? (
              <Space size={4} wrap>
                <Tag>{selectedRunSummary.currencyCode}</Tag>
                <Tag color={varianceItems === 0 ? 'green' : 'orange'}>{matchedItems}/{items.length} khớp</Tag>
              </Space>
            ) : null}
          >
            {selectedRun ? (
              <Table<ReconItemDto>
                rowKey={(row) => `${row.code}-${row.status}-${row.transactionId ?? ''}`}
                size="middle"
                columns={itemCols}
                dataSource={items}
                pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bản đối chiếu chưa có dữ liệu" /> }}
              />
            ) : (
              <div className="reconciliation-empty-detail">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chọn một bản đối chiếu để xem giao dịch hệ thống và Journal" />
              </div>
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={<span className="section-card-title"><HistoryOutlined />{isBranchUser ? `Lịch sử ${provider} chi nhánh` : `Lịch sử ${provider} bản cuối`}</span>}
            size="small"
            className="polished-card reconciliation-panel"
          >
            <Table<ReconRunDto>
              rowKey="id"
              size="small"
              columns={runCols}
              dataSource={visibleRuns}
              rowClassName={(record) => record.id === selectedRun ? 'reconciliation-row--active' : ''}
              pagination={{ pageSize: 6, size: 'small', hideOnSinglePage: true }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Chưa có lịch sử đối chiếu ${provider}`} /> }}
            />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
