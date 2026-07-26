import { PlayCircleOutlined, PoweroffOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useShiftStore } from '@/modules/shift-management/model/shift.store';
import { getTransactionAccess } from '@/modules/transactions/model/transactionAccess';
import { formatForeignCurrency, formatVnd } from '@/shared/utils/formatters';
import { isUiTestMode } from '@/shared/config/runtime';
import {
  BalanceOverviewCard,
} from '../components/BalanceOverviewCard';
import { dashboardActionIcons } from '../constants/actionIcons';
import { DashboardAlertItem } from '../components/DashboardAlertItem';
import { KpiGrid } from '../components/KpiGrid';
import { RateCard } from '../components/RateCard';
import {
  branchAlertsMock,
  branchDashboardSummaryMock,
  branchFundsMock,
  branchKpisMock,
  branchOverviewMock,
  branchSubBalancesMock,
  fundACurrenciesMock,
  type FundACurrency,
} from '../data/branchDashboard.mock';

const fundAColumns: ColumnsType<FundACurrency> = [
  {
    title: 'Ngoại tệ',
    dataIndex: 'currency',
    render: (value: string, record) => (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{value}</Typography.Text>
        <Typography.Text type="secondary">{record.name}</Typography.Text>
      </Space>
    ),
  },
  {
    title: 'Tồn quỹ',
    dataIndex: 'amount',
    align: 'right',
    render: (value: number, record) => formatForeignCurrency(value, record.currency),
  },
  {
    title: 'Quy đổi VND',
    dataIndex: 'vndValue',
    align: 'right',
    render: (value: number) => formatVnd(value),
  },
  {
    title: 'Trạng thái',
    dataIndex: 'status',
    render: (value: FundACurrency['status']) => {
      const statusMap = {
        normal: { color: 'green', label: 'Đủ quỹ' },
        watch: { color: 'gold', label: 'Theo dõi' },
        low: { color: 'red', label: 'Sắp thiếu' },
      };

      return <Tag color={statusMap[value].color}>{statusMap[value].label}</Tag>;
    },
  },
];

export function BranchDashboardPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const currentShift = useShiftStore((state) => state.currentShift);
  const transactionAccess = getTransactionAccess(role, currentShift);
  const hasOpenShift = currentShift?.status === 'OPEN';

  return (
    <Space direction="vertical" size={16} className="w-full">
      <BalanceOverviewCard
        eyebrow={`Chi nhánh ${currentShift?.branchName ?? branchOverviewMock.fallbackBranchName}`}
        amount={branchOverviewMock.amount}
        statusTag={branchOverviewMock.statusTag}
        caption={branchOverviewMock.caption}
        sparklineBars={branchOverviewMock.sparklineBars}
        subBalances={branchSubBalancesMock}
        actions={[
          {
            label: 'Tạo GD WU',
            icon: dashboardActionIcons.wu,
            primary: true,
            disabled: !transactionAccess.canCreate && !isUiTestMode,
            onClick: () => navigate('/western-union/transactions'),
          },
          {
            label: 'Tạo GD MG',
            icon: dashboardActionIcons.mg,
            primary: true,
            disabled: !transactionAccess.canCreate && !isUiTestMode,
            onClick: () => navigate('/moneygram/transactions'),
          },
          {
            label: 'Chuyển khoản quốc nội',
            icon: dashboardActionIcons.domesticTransfer,
            disabled: !transactionAccess.canCreate && !isUiTestMode,
            onClick: () => navigate('/domestic-transfer/transactions'),
          },
          {
            label: 'Mua/Bán ngoại tệ',
            icon: dashboardActionIcons.fx,
            disabled: !transactionAccess.canCreate && !isUiTestMode,
            onClick: () => navigate('/foreign-exchange/trading'),
          },
        ]}
      />

      <KpiGrid items={branchKpisMock} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card
            title="Quỹ riêng chi nhánh"
            extra={<Typography.Text type="secondary">{branchDashboardSummaryMock.date}</Typography.Text>}
          >
            <Row gutter={[16, 16]}>
              {branchFundsMock.map((fund) => (
                <Col xs={24} md={8} key={fund.label}>
                  <RateCard {...fund} />
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
  <Card
    title="Ca làm việc"
    extra={
      hasOpenShift ? (
        <Button
          danger
          icon={<PoweroffOutlined />}
          onClick={() => navigate('/shift-management/close-shift')}
        >
          Đóng ca
        </Button>
      ) : (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={() => navigate('/shift-management/open-shift')}
        >
          Mở ca
        </Button>
      )
    }
  >
    {hasOpenShift ? (
      <>
        <Tag color="green">Đang mở</Tag>

        <Descriptions
          column={1}
          size="small"
          className="mt-4"
        >
          <Descriptions.Item label="Nhân viên">
            {currentShift?.openedBy}
          </Descriptions.Item>

          <Descriptions.Item label="Mã ca">
            {currentShift?.code}
          </Descriptions.Item>

          <Descriptions.Item label="Mở ca">
            {currentShift?.openedAt}
          </Descriptions.Item>

          <Descriptions.Item label="Đóng ca">
            ---
          </Descriptions.Item>
        </Descriptions>
      </>
    ) : (
      <>
          <Tag color={currentShift?.status === 'CLOSED' ? 'red' : 'default'}>
            {currentShift?.status === 'CLOSED' ? 'Đã đóng' : 'Chưa mở ca'}
          </Tag>

        <div className="mt-4">
          {currentShift?.status === 'CLOSED'
            ? `Ca ${currentShift.code} đã đóng. Giao dịch chỉ được xem.`
            : 'Hiện chưa có ca làm việc nào đang mở.'}
        </div>
      </>
    )}
  </Card>
</Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card title="Danh sách Quỹ A" extra={<Typography.Text type="secondary">Ngoại tệ khác ngoài VND/USD</Typography.Text>}>
            <Table columns={fundAColumns} dataSource={fundACurrenciesMock} pagination={false} size="middle" />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="Cảnh báo" extra={<Tag color="gold">{branchDashboardSummaryMock.alertCount} cần chú ý</Tag>}>
            <Space direction="vertical" size={10} className="w-full">
              {branchAlertsMock.map((alert) => (
                <DashboardAlertItem key={alert.title} {...alert} />
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
