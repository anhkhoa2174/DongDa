import {
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  DollarOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileSearchOutlined,
  SwapOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Col, DatePicker, Row, Select, Space, Statistic, Table, Tabs, Typography } from 'antd';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { formatVnd } from '@/shared/utils/formatters';
import { DATE_INPUT_FORMAT, DATE_RANGE_PLACEHOLDERS } from '@/shared/utils/datePicker';
import { summaryApi, type ReportPreviewDto } from '../api/summary.api';
import { useNotify } from '@/app/providers/notifications/useNotify';
import { useBranches } from '@/shared/hooks/useBranches';

// Sổ thu chi hằng ngày: cột chọn được (mặc định = đúng cột sổ mẫu Excel + Loại)
const CASHBOOK_COLUMNS: { value: string; label: string }[] = [
  { value: 'stt', label: 'STT' },
  { value: 'date', label: 'Ngày' },
  { value: 'time', label: 'Giờ' },
  { value: 'kind', label: 'Loại (WU/MG/Tiếp quỹ...)' },
  { value: 'code', label: 'MTCN / Mã' },
  { value: 'name', label: 'Họ tên người nhận / Nguồn tiền' },
  { value: 'inUsd', label: 'Nhận USD' },
  { value: 'inVnd', label: 'Nhận VND' },
  { value: 'outUsd', label: 'Chi USD' },
  { value: 'outVnd', label: 'Chi VND' },
  { value: 'balanceUsd', label: 'Tồn USD' },
  { value: 'balanceVnd', label: 'Tồn VND' },
  { value: 'description', label: 'Diễn giải' },
];
const CASHBOOK_DEFAULT_COLUMNS = ['stt', 'date', 'kind', 'code', 'name', 'inUsd', 'inVnd', 'outUsd', 'outVnd', 'balanceUsd', 'balanceVnd'];

// 10 loại báo cáo, đặt đúng tên anh Kiển đưa (DongDav6). Nhóm "theo sổ quỹ" bắt buộc chọn chi nhánh.
const LEDGER_TYPES = ['cashbook', 'wu_payout', 'wu_usd', 'mg_usd'];
const reportCards = [
  { key: 'cashbook',  title: '1. Sổ theo dõi thu chi hằng ngày',           desc: 'Từng giao dịch, tồn chạy dần theo chi nhánh (mẫu sổ quỹ)', icon: <BookOutlined />,   color: '#0f766e' },
  { key: 'wu_payout', title: '2. Báo cáo theo dõi chi trả Western Union',  desc: 'Mỗi ngày 1 sheet: MTCN, người nhận, nhận/chi/tồn USD-VND',  icon: <SwapOutlined />,   color: '#2563eb' },
  { key: 'wu_usd',    title: '3. Báo cáo theo dõi thu chi USD',            desc: 'Sổ quỹ WU theo tháng, 1 loại tiền, THU/CHI/TỒN chạy dần',   icon: <DollarOutlined />, color: '#0891b2' },
  { key: 'mg_usd',    title: '4. Báo cáo theo dõi thu chi MoneyGram',      desc: 'Như số 3 nhưng cho MoneyGram (Reference)',                  icon: <SwapOutlined />,   color: '#7c3aed' },
  { key: 'fund',      title: '5. Báo cáo Vốn và Quỹ',                      desc: 'Tồn đầu/cuối ngày từng chi nhánh, quỹ chung, toàn hệ thống', icon: <WalletOutlined />, color: '#2563eb' },
  { key: 'fx',        title: '6. Báo cáo Ngoại tệ',                        desc: 'Số lượng mua bán, tồn, tỷ giá, lợi nhuận',                  icon: <DollarOutlined />, color: '#16a34a' },
  { key: 'transfer',  title: '7. Báo cáo Điều động Vốn',                   desc: 'Lịch sử luân chuyển vốn',                                   icon: <UsergroupAddOutlined />, color: '#0891b2' },
  { key: 'gap',       title: '8. Báo cáo Sai lệch và Rủi ro',              desc: 'Sai lệch vốn, chưa match WU/MG/quỹ, đã/cần xử lý',           icon: <WarningOutlined />, color: '#d97706' },
  { key: 'debt',      title: '9. Báo cáo Công nợ',                         desc: 'WU/MG chờ thanh toán từ ngân hàng, dẫn nguồn',              icon: <FileSearchOutlined />, color: '#dc2626' },
  { key: 'bank',      title: '10. Báo cáo Ngân hàng',                      desc: 'Sao kê, đối chiếu, tồn đầu/cuối từng tài khoản',            icon: <BankOutlined />,   color: '#f5b301' },
];

export function ReportsPage() {
  const [reportType, setReportType] = useState('cashbook');
  const [ledgerCurrency, setLedgerCurrency] = useState<'USD' | 'VND'>('USD');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [branchId, setBranchId] = useState<string>();
  const [cashbookColumns, setCashbookColumns] = useState<string[]>(CASHBOOK_DEFAULT_COLUMNS);
  const [preview, setPreview] = useState<ReportPreviewDto | null>(null);
  const isCashbook = reportType === 'cashbook';
  const isLedger = LEDGER_TYPES.includes(reportType);
  const hasCurrencyOption = reportType === 'wu_usd' || reportType === 'mg_usd';
  const { data: branches = [] } = useBranches();
  const { data: dashboard } = useQuery({
    queryKey: ['reports', 'dashboard', range[1].format('YYYY-MM-DD')],
    queryFn: () => summaryApi.companyDashboard(range[1].format('YYYY-MM-DD')),
  });
  const notify = useNotify();
  const generateReport = useMutation({
    mutationFn: ({ format, type = reportType }: { format: 'PREVIEW' | 'EXCEL' | 'PDF'; type?: string }) => {
      if (LEDGER_TYPES.includes(type) && !branchId) {
        return Promise.reject(new Error('Báo cáo theo sổ quỹ (1–4) phải chọn chi nhánh'));
      }
      return summaryApi.generate({
        reportType: type, format, branchId,
        dateFrom: range[0].format('YYYY-MM-DD'), dateTo: range[1].format('YYYY-MM-DD'),
        columns: type === 'cashbook' ? cashbookColumns : undefined,
        currencyCode: type === 'wu_usd' || type === 'mg_usd' ? ledgerCurrency : undefined,
      });
    },
    onSuccess: (data, { format }) => {
      if (format === 'PREVIEW' && data && typeof data === 'object' && 'sheets' in data) setPreview(data as ReportPreviewDto);
      notify.success(
        format === 'PREVIEW' ? 'Đã tổng hợp dữ liệu báo cáo'
          : format === 'EXCEL' ? 'Đã tải file Excel báo cáo'
          : `Đã chuẩn bị báo cáo ${format}`,
      );
    },
    onError: (error: unknown) => notify.error(getApiErrorMessage(error, 'Không thể tạo báo cáo')),
  });

  return (
    <PageScaffold
      title="Báo cáo quản trị"
      description="Tổng hợp báo cáo theo ngày / tuần / tháng / năm cho vốn, WU/MG, ngoại tệ, ngân hàng, công nợ, sai lệch."
      moduleName="reports"
    >
      <Card
        title="Tạo báo cáo tùy chỉnh"
        className="mb-4"
        extra={
          <Space>
            <Button loading={generateReport.isPending} icon={<FileExcelOutlined />} onClick={() => generateReport.mutate({ format: 'EXCEL' })}>Xuất Excel</Button>
            <Button loading={generateReport.isPending} icon={<FilePdfOutlined />} onClick={() => generateReport.mutate({ format: 'PDF' })}>Xuất PDF</Button>
            <Button loading={generateReport.isPending} type="primary" icon={<BarChartOutlined />} onClick={() => generateReport.mutate({ format: 'PREVIEW' })}>Xem trước</Button>
          </Space>
        }
      >
        <Row gutter={16}>
          <Col xs={24} md={6}>
            <Typography.Text type="secondary" className="text-xs!">Loại báo cáo</Typography.Text>
            <Select className="w-full" value={reportType} onChange={setReportType} options={reportCards.map((r) => ({ value: r.key, label: r.title }))} />
          </Col>
          <Col xs={24} md={9}>
            <Typography.Text type="secondary" className="text-xs!">Khoảng thời gian</Typography.Text>
            <DatePicker.RangePicker className="w-full" format={DATE_INPUT_FORMAT} placeholder={DATE_RANGE_PLACEHOLDERS} value={range} onChange={(value) => value && setRange(value as [Dayjs, Dayjs])} />
          </Col>
          <Col xs={24} md={5}>
            <Typography.Text type="secondary" className="text-xs!">Chi nhánh</Typography.Text>
            <Select
              className="w-full"
              allowClear={!isLedger}
              placeholder={isLedger ? 'Bắt buộc chọn chi nhánh' : 'Tất cả chi nhánh'}
              status={isLedger && !branchId ? 'warning' : undefined}
              value={branchId}
              onChange={setBranchId}
              options={branches.map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` }))}
            />
          </Col>
          <Col xs={24} md={4}>
            <Typography.Text type="secondary" className="text-xs!">{hasCurrencyOption ? 'Loại quỹ' : 'Tần suất'}</Typography.Text>
            {hasCurrencyOption ? (
              <Select className="w-full" value={ledgerCurrency} onChange={setLedgerCurrency} options={[{ value: 'USD', label: 'USD' }, { value: 'VND', label: 'VND' }]} />
            ) : (
            <Select
              className="w-full"
              defaultValue="daily"
              options={[
                { value: 'daily', label: 'Ngày' },
                { value: 'weekly', label: 'Tuần' },
                { value: 'monthly', label: 'Tháng' },
                { value: 'yearly', label: 'Năm' },
              ]}
            />
            )}
          </Col>
        </Row>
        {isCashbook && (
          <div className="mt-4">
            <Alert
              type="info"
              showIcon
              className="mb-3"
              message="Sổ thu chi hằng ngày: mỗi ngày 1 sheet, liệt kê từng giao dịch WU/MG/FX, tiếp quỹ, phiếu thu/chi trên sổ tiền mặt VND/USD của chi nhánh, tồn chạy dần từ tồn đầu kỳ. Tối đa 62 ngày/lần."
            />
            <Typography.Text type="secondary" className="text-xs!">Cột hiển thị trong sổ</Typography.Text>
            <div className="mt-1">
              <Checkbox.Group
                value={cashbookColumns}
                onChange={(values) => setCashbookColumns(values as string[])}
                options={CASHBOOK_COLUMNS}
              />
            </div>
            <Space className="mt-2">
              <Button size="small" type="link" className="p-0!" onClick={() => setCashbookColumns(CASHBOOK_DEFAULT_COLUMNS)}>Theo sổ mẫu</Button>
              <Button size="small" type="link" className="p-0!" onClick={() => setCashbookColumns(CASHBOOK_COLUMNS.map((c) => c.value))}>Tất cả cột</Button>
            </Space>
          </div>
        )}
      </Card>

      {preview && (
        <Card
          title={`Xem trước: ${preview.title}`}
          className="mb-4"
          extra={<Button size="small" onClick={() => setPreview(null)}>Đóng</Button>}
        >
          <Tabs
            items={preview.sheets.map((sheet, index) => ({
              key: `${index}-${sheet.name}`,
              label: sheet.name,
              children: (
                <Table
                  size="small"
                  bordered
                  pagination={{ pageSize: 50, hideOnSinglePage: true }}
                  scroll={{ x: 'max-content' }}
                  rowKey={(_, i) => String(i)}
                  showHeader={false}
                  dataSource={sheet.aoa.map((row, i) => ({ key: i, cells: row }))}
                  columns={Array.from({ length: Math.max(...sheet.aoa.map((r) => r.length), 1) }, (_, c) => ({
                    key: c,
                    dataIndex: ['cells', c],
                    render: (value: string | number) => (typeof value === 'number' ? value.toLocaleString('vi-VN') : value),
                  }))}
                />
              ),
            }))}
          />
        </Card>
      )}

      <Row gutter={[16, 16]} className="mb-4">
        {reportCards.map((r) => (
          <Col xs={24} sm={12} md={8} lg={6} key={r.key}>
            <Card hoverable className="h-full cursor-pointer">
              <div className="text-2xl mb-2" style={{ color: r.color }}>{r.icon}</div>
              <div className="font-semibold">{r.title}</div>
              <Typography.Text type="secondary" className="text-xs!">{r.desc}</Typography.Text>
              <div className="mt-2">
                <Button
                  size="small"
                  type="link"
                  className="p-0!"
                  icon={<DownloadOutlined />}
                  loading={generateReport.isPending}
                  onClick={() => generateReport.mutate({ format: 'EXCEL', type: r.key })}
                >
                  Tải nhanh
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="Giá trị giao dịch — 7 ngày gần nhất">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard?.transactionValueTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatVnd(v)} />
                <Bar dataKey="valueVnd" fill="#f5b301" name="Giá trị giao dịch" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Leaderboard chi nhánh hôm nay">
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={dashboard?.branches ?? []}
              columns={[
                { title: 'Chi nhánh', dataIndex: 'name' },
                { title: 'GD', dataIndex: 'todayTransactions', align: 'center' },
                {
                  title: 'Giá trị giao dịch',
                  dataIndex: 'transactionValueTodayVnd',
                  align: 'right',
                  render: (v: number) => (
                    <Typography.Text strong style={{ color: v > 0 ? '#16a34a' : '#64748b' }}>
                      {formatVnd(v)}
                    </Typography.Text>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} className="mt-4">
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="GD trong ngày" value={dashboard?.operations.transactionCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Giá trị giao dịch" value={dashboard?.operations.transactionValueVnd ?? 0} formatter={(v) => formatVnd(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Chi nhánh đang mở" value={`${dashboard?.operations.openBranchCount ?? 0} / ${dashboard?.operations.totalBranchCount ?? 0}`} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Sai lệch chờ xử lý" value={dashboard?.operations.pendingVarianceCount ?? 0} valueStyle={{ color: '#d97706' }} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
