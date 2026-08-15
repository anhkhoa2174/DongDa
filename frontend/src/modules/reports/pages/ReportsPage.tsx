import {
  BankOutlined,
  BarChartOutlined,
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
import { Button, Card, Col, DatePicker, Row, Select, Space, Statistic, Table, Typography } from 'antd';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatVnd } from '@/shared/utils/formatters';
import { summaryApi } from '../api/summary.api';
import { useNotify } from '@/app/providers/notifications/useNotify';
import { useBranches } from '@/modules/western-union/hooks/useWu';

const reportCards = [
  { key: 'fund',     title: 'Báo cáo Vốn & Quỹ',    desc: 'Tổng vốn, biến động, tồn quỹ',     icon: <WalletOutlined />,        color: '#2563eb' },
  { key: 'wu',       title: 'Báo cáo WU',           desc: 'GD, công nợ, lợi nhuận',           icon: <SwapOutlined />,          color: '#2563eb' },
  { key: 'mg',       title: 'Báo cáo MoneyGram',    desc: 'GD, công nợ, lợi nhuận',           icon: <SwapOutlined />,          color: '#7c3aed' },
  { key: 'fx',       title: 'Báo cáo Ngoại tệ',     desc: 'Mua bán, tồn kho, lợi nhuận',      icon: <DollarOutlined />,        color: '#16a34a' },
  { key: 'transfer', title: 'Báo cáo Điều động',    desc: 'Lịch sử luân chuyển vốn',          icon: <UsergroupAddOutlined />,  color: '#0891b2' },
  { key: 'gap',      title: 'Báo cáo Sai lệch',     desc: 'Chênh lệch quỹ, đối chiếu',        icon: <WarningOutlined />,       color: '#d97706' },
  { key: 'debt',     title: 'Báo cáo Công nợ',      desc: 'WU/MG chờ thanh toán',             icon: <FileSearchOutlined />,    color: '#dc2626' },
  { key: 'bank',     title: 'Báo cáo Ngân hàng',    desc: 'Sao kê, đối chiếu ACB/MSB',        icon: <BankOutlined />,          color: '#f5b301' },
];

export function ReportsPage() {
  const [reportType, setReportType] = useState('wu');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const [branchId, setBranchId] = useState<string>();
  const { data: branches = [] } = useBranches();
  const { data: dashboard } = useQuery({
    queryKey: ['reports', 'dashboard', range[1].format('YYYY-MM-DD')],
    queryFn: () => summaryApi.companyDashboard(range[1].format('YYYY-MM-DD')),
  });
  const notify = useNotify();
  const generateReport = useMutation({
    mutationFn: ({ format, type = reportType }: { format: 'PREVIEW' | 'EXCEL' | 'PDF'; type?: string }) =>
      summaryApi.generate({
        reportType: type, format, branchId,
        dateFrom: range[0].format('YYYY-MM-DD'), dateTo: range[1].format('YYYY-MM-DD'),
      }),
    onSuccess: (_, { format }) => notify.success(
      format === 'PREVIEW' ? 'Đã tổng hợp dữ liệu báo cáo'
        : format === 'EXCEL' ? 'Đã tải file Excel báo cáo'
        : `Đã chuẩn bị báo cáo ${format}`,
    ),
    onError: (e: any) => notify.error(
      typeof e?.response?.data?.message === 'string' ? e.response.data.message : 'Không thể tạo báo cáo',
    ),
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
            <DatePicker.RangePicker className="w-full" value={range} onChange={(value) => value && setRange(value as [Dayjs, Dayjs])} />
          </Col>
          <Col xs={24} md={5}>
            <Typography.Text type="secondary" className="text-xs!">Chi nhánh</Typography.Text>
            <Select
              className="w-full"
              allowClear
              placeholder="Tất cả chi nhánh"
              value={branchId}
              onChange={setBranchId}
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            />
          </Col>
          <Col xs={24} md={4}>
            <Typography.Text type="secondary" className="text-xs!">Tần suất</Typography.Text>
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
          </Col>
        </Row>
      </Card>

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
          <Card title="Giá trị giao dịch và lợi nhuận — 7 ngày gần nhất">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard?.revenueTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatVnd(v)} />
                <Bar dataKey="revenueVnd" fill="#111111" name="Giá trị giao dịch" />
                <Bar dataKey="profitVnd" fill="#f5b301" name="Lợi nhuận" />
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
                  title: 'Lợi nhuận',
                  dataIndex: 'profitToday',
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
            <Statistic title="Lợi nhuận tạm tính" value={(dashboard?.branches ?? []).reduce((sum, branch) => sum + branch.profitToday, 0)} valueStyle={{ color: '#16a34a' }} formatter={(v) => formatVnd(Number(v))} />
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
