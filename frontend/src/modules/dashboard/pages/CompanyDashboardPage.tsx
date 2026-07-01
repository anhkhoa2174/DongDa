import {
  BankOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  MoneyCollectOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, formatNumber } from '@/shared/utils/formatters';
import {
  BalanceOverviewCard,
} from '../components/BalanceOverviewCard';
import { KpiGrid } from '../components/KpiGrid';
import {
  branchStatusesMock,
  companyBusinessKpisMock,
  companyExchangeRatesMock,
  companyKpisMock,
  companyOverviewMock,
  companyRatesSummaryMock,
  companyRevenueTrendMock,
  companySubBalancesMock,
  companyTransactionMixMock,
  type BranchStatus,
} from '../data/companyDashboard.mock';

type CompanyExchangeRate = (typeof companyExchangeRatesMock)[number];

const branchColumns: ColumnsType<BranchStatus> = [
  {
    title: 'Chi nhánh',
    dataIndex: 'branch',
    fixed: 'left',
    render: (value: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{value}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs!">{record.manager}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Trạng thái ca',
    dataIndex: 'shiftStatus',
    render: (value: BranchStatus['shiftStatus']) =>
      value === 'open' ? <Tag color="green">● Đang mở</Tag> : <Tag color="gold">○ Chưa mở ca</Tag>,
  },
  {
    title: 'Tồn VND',
    dataIndex: 'vndBalance',
    align: 'right',
    render: (value: number) => formatCurrency(value),
  },
  {
    title: 'Tồn USD',
    dataIndex: 'usdBalance',
    align: 'right',
    render: (value: number) => `$ ${formatNumber(value)}`,
  },
  {
    title: 'GD',
    dataIndex: 'todayTransactions',
    align: 'right',
  },
  {
    title: 'Doanh số',
    dataIndex: 'revenueToday',
    align: 'right',
    render: (value: number) => formatCurrency(value),
  },
  {
    title: 'LN tạm tính',
    dataIndex: 'profitToday',
    align: 'right',
    render: (value: number) => <Typography.Text className="text-emerald-600!">{formatCurrency(value)}</Typography.Text>,
  },
  {
    title: 'Chênh lệch',
    dataIndex: 'discrepancyLabel',
    render: (value: string, record) => {
      const colorMap = {
        matched: 'green',
        warning: 'gold',
        danger: 'red',
        none: 'default',
      } as const;

      return <Tag color={colorMap[record.discrepancy]}>{value}</Tag>;
    },
  },
  {
    title: 'Rủi ro',
    dataIndex: 'riskLevel',
    render: (value: BranchStatus['riskLevel']) => {
      const meta = {
        normal: { label: 'Ổn định', color: 'green' },
        watch: { label: 'Theo dõi', color: 'gold' },
        risk: { label: 'Rủi ro', color: 'red' },
      }[value];

      return <Tag color={meta.color}>{meta.label}</Tag>;
    },
  },
];

const MAX_VISIBLE_RATES = 6;
const mixColors = ['#0f766e', '#2563eb', '#16a34a', '#f59e0b'];

const rateColumns: ColumnsType<CompanyExchangeRate> = [
  {
    title: 'Tỷ giá',
    dataIndex: 'label',
    render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
  },
  {
    title: 'Giá trị',
    dataIndex: 'value',
    align: 'right',
    render: (value: string) => <Typography.Text className="font-mono text-base! font-semibold!">{value}</Typography.Text>,
  },
  {
    title: 'Biên độ',
    dataIndex: 'adjustment',
    align: 'center',
    render: (value: string) => <Tag color="blue">{value}</Tag>,
  },
  {
    title: 'Trạng thái',
    key: 'status',
    align: 'center',
    render: () => <Tag color="green">ACTIVE</Tag>,
  },
];

export function CompanyDashboardPage() {
  const navigate = useNavigate();
  const visibleRates = companyExchangeRatesMock.slice(0, MAX_VISIBLE_RATES);
  const hiddenRateCount = companyExchangeRatesMock.length - visibleRates.length;

  return (
    <Space direction="vertical" size={16} className="w-full">
      <BalanceOverviewCard
        {...companyOverviewMock}
        subBalances={companySubBalancesMock}
        actions={[
          {
            label: 'Công nợ',
            icon: <FileSearchOutlined />,
            primary: true,
            onClick: () => navigate('/debt-management/debt-list'),
          },
          {
            label: 'Quỹ chung',
            icon: <MoneyCollectOutlined />,
            onClick: () => navigate('/fund-management/central-fund'),
          },
          {
            label: 'Ngân hàng',
            icon: <BankOutlined />,
            onClick: () => navigate('/bank-management/accounts'),
          },
          {
            label: 'Tỷ giá',
            icon: <CheckCircleOutlined />,
            onClick: () => navigate('/exchange-rate'),
          },
        ]}
      />

      <KpiGrid items={companyBusinessKpisMock} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card title="Doanh số và lợi nhuận 7 ngày" extra={<Typography.Text type="secondary">Đơn vị: tỷ ₫ / triệu ₫</Typography.Text>}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={companyRevenueTrendMock} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Doanh số" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="profit" name="Lợi nhuận" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="Cơ cấu giao dịch hôm nay">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={companyTransactionMixMock}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={64}
                    outerRadius={104}
                    paddingAngle={3}
                    label
                  >
                    {companyTransactionMixMock.map((entry, index) => (
                      <Cell key={entry.name} fill={mixColors[index % mixColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card title="Hiệu quả theo chi nhánh" extra={<Typography.Text type="secondary">Lợi nhuận tạm tính</Typography.Text>}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchStatusesMock} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="branch" width={92} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="profitToday" name="Lợi nhuận" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card
            title="Danh sách tỷ giá đang áp dụng"
            extra={<Typography.Text type="secondary">Hiển thị tối đa {MAX_VISIBLE_RATES} tỷ giá để cân đối màn hình</Typography.Text>}
          >
            <Space direction="vertical" size={12} className="w-full">
              <div className="flex items-center justify-between gap-3">
                <Space>
                  <Tag color="green">● {companyRatesSummaryMock.status}</Tag>
                  <Typography.Text type="secondary">{companyRatesSummaryMock.metadata}</Typography.Text>
                </Space>
                {hiddenRateCount > 0 && <Tag>+{hiddenRateCount} tỷ giá khác</Tag>}
              </div>
              <Table
                columns={rateColumns}
                dataSource={visibleRates}
                rowKey="label"
                pagination={false}
                size="middle"
              />
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title="Danh sách quản lý chi nhánh"
        extra={<Typography.Text type="secondary">{branchStatusesMock.length} chi nhánh · {companyRatesSummaryMock.date}</Typography.Text>}
      >
        <Table
          columns={branchColumns}
          dataSource={branchStatusesMock}
          pagination={false}
          size="middle"
          scroll={{ x: 1180 }}
        />
      </Card>

      <KpiGrid items={companyKpisMock} />
    </Space>
  );
}
