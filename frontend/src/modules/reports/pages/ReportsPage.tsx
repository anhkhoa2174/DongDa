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
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatVnd } from '@/shared/utils/formatters';

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

const revenueData = [
  { day: '23/06', wu: 4200000, mg: 800000 },
  { day: '24/06', wu: 5100000, mg: 1200000 },
  { day: '25/06', wu: 3800000, mg: 900000 },
  { day: '26/06', wu: 5800000, mg: 1500000 },
  { day: '27/06', wu: 6200000, mg: 1400000 },
  { day: '28/06', wu: 4800000, mg: 1100000 },
  { day: '29/06', wu: 4500000, mg: 1000000 },
];

const branchLeaderboard = [
  { branch: 'CN NCT',           wu: 12, mg: 3, fx: 2, transfer: 1, total: 18, profit: 4_500_000 },
  { branch: 'CN Tao Đàn',       wu: 9,  mg: 2, fx: 3, transfer: 0, total: 14, profit: 3_200_000 },
  { branch: 'CN Lê Hồng Phong', wu: 11, mg: 2, fx: 1, transfer: 2, total: 16, profit: 4_100_000 },
  { branch: 'CN Bảy Hiền',      wu: 0,  mg: 0, fx: 0, transfer: 0, total: 0,  profit: 0 },
  { branch: 'CN An Đông',       wu: 15, mg: 1, fx: 1, transfer: 1, total: 18, profit: 5_200_000 },
];

export function ReportsPage() {
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
            <Button icon={<FileExcelOutlined />}>Xuất Excel</Button>
            <Button icon={<FilePdfOutlined />}>Xuất PDF</Button>
            <Button type="primary" icon={<BarChartOutlined />}>Xem trước</Button>
          </Space>
        }
      >
        <Row gutter={16}>
          <Col xs={24} md={6}>
            <Typography.Text type="secondary" className="text-xs!">Loại báo cáo</Typography.Text>
            <Select className="w-full" defaultValue="wu" options={reportCards.map((r) => ({ value: r.key, label: r.title }))} />
          </Col>
          <Col xs={24} md={9}>
            <Typography.Text type="secondary" className="text-xs!">Khoảng thời gian</Typography.Text>
            <DatePicker.RangePicker className="w-full" />
          </Col>
          <Col xs={24} md={5}>
            <Typography.Text type="secondary" className="text-xs!">Chi nhánh</Typography.Text>
            <Select
              className="w-full"
              defaultValue="all"
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'nct', label: 'NCT' },
                { value: 'td', label: 'Tao Đàn' },
                { value: 'lhp', label: 'Lê Hồng Phong' },
                { value: 'bh', label: 'Bảy Hiền' },
                { value: 'ad', label: 'An Đông' },
              ]}
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
                <Button size="small" type="link" className="p-0!" icon={<DownloadOutlined />}>Tải nhanh</Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Card title="Doanh số WU/MG — 7 ngày gần nhất">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatVnd(v)} />
                <Bar dataKey="wu" fill="#2563eb" name="Western Union" />
                <Bar dataKey="mg" fill="#7c3aed" name="MoneyGram" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Leaderboard chi nhánh hôm nay">
            <Table
              rowKey="branch"
              size="small"
              pagination={false}
              dataSource={branchLeaderboard}
              columns={[
                { title: 'Chi nhánh', dataIndex: 'branch' },
                { title: 'GD', dataIndex: 'total', align: 'center' },
                {
                  title: 'Lợi nhuận',
                  dataIndex: 'profit',
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
            <Statistic title="GD hôm nay" value={66} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Doanh thu hôm nay" value={5_500_000} formatter={(v) => formatVnd(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Lợi nhuận TG" value={17_000_000} valueStyle={{ color: '#16a34a' }} formatter={(v) => formatVnd(Number(v))} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Chênh lệch quỹ" value={205_000} valueStyle={{ color: '#d97706' }} formatter={(v) => formatVnd(Number(v))} />
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
}
