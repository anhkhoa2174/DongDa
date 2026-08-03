import {
  DollarOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  useBranchActivity,
  useBranchFunds,
} from '@/modules/branch-management/hooks/useBranchMonitoring';
import type { FundCurrencyBalanceDto } from '@/modules/branch-management/api/branchMonitoring.api';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useTransactionShift } from '@/modules/transactions/hooks/useTransactionShift';
import { getTransactionAccess } from '@/modules/transactions/model/transactionAccess';
import {
  formatDateTime,
  formatExchangeRate,
  formatForeignCurrency,
  formatUsd,
  formatVnd,
} from '@/shared/utils/formatters';
import { isUiTestMode } from '@/shared/config/runtime';
import { BalanceOverviewCard } from '../components/BalanceOverviewCard';
import { dashboardActionIcons } from '../constants/actionIcons';
import { KpiGrid } from '../components/KpiGrid';
import { RateCard } from '../components/RateCard';

const fundAColumns: ColumnsType<FundCurrencyBalanceDto> = [
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
    title: 'Số lượng',
    dataIndex: 'amount',
    align: 'right',
    render: (value: number, record) => formatForeignCurrency(value, record.currency),
  },
  {
    title: 'Tỷ giá mua',
    dataIndex: 'buyRate',
    align: 'right',
    render: (value: number) => value > 0 ? formatExchangeRate(value) : 'Chưa có',
  },
  {
    title: 'Quy đổi VND',
    dataIndex: 'vndValue',
    align: 'right',
    render: (value: number) => formatVnd(value),
  },
  {
    title: 'Trạng thái',
    dataIndex: 'amount',
    render: (value: number) => value < 0
      ? <Tag color="red">Âm quỹ</Tag>
      : value === 0 ? <Tag>Hết quỹ</Tag> : <Tag color="green">Có sẵn</Tag>,
  },
];

function sparkline(values: number[]) {
  const normalized = values.length > 0 ? values.slice(-7) : [0];
  const max = Math.max(...normalized.map((value) => Math.abs(value)), 0);
  const bars = normalized.map((value) => max > 0 ? Math.max(8, Math.round((Math.abs(value) / max) * 100)) : 8);
  return [...Array(Math.max(0, 7 - bars.length)).fill(8), ...bars];
}

export function BranchDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const branchId = user?.branchId;
  const dashboardDate = dayjs().format('YYYY-MM-DD');
  const { currentShift } = useTransactionShift();
  const { data: funds, isLoading: isFundsLoading, isError: isFundsError } = useBranchFunds(branchId);
  const { data: activity, isLoading: isActivityLoading, isError: isActivityError } = useBranchActivity(
    branchId,
    'day',
    dashboardDate,
  );
  const transactionAccess = getTransactionAccess(user?.role, currentShift);
  const hasOpenShift = currentShift?.status === 'OPEN';
  const sourceCount = (source: 'WU' | 'MG' | 'FX' | 'DOMESTIC') =>
    activity?.sourceMix.find((item) => item.source === source)?.count ?? 0;
  const pendingCount = funds?.pendingTransferCount ?? 0;
  const alerts = [
    ...(!hasOpenShift ? [{ type: 'warning' as const, message: 'Chi nhánh chưa mở ca làm việc.' }] : []),
    ...(funds?.status === 'NEEDS_RECONCILIATION'
      ? [{ type: 'error' as const, message: 'Lần kiểm quỹ gần nhất có sai lệch cần đối chiếu.' }]
      : []),
    ...(funds?.status === 'LOW_CASH'
      ? [{ type: 'error' as const, message: 'Có tài khoản quỹ đang âm số dư.' }]
      : []),
    ...(pendingCount > 0
      ? [{ type: 'info' as const, message: `${pendingCount} phiếu tiếp quỹ đang chờ xử lý.` }]
      : []),
  ];
  const kpis = [
    {
      label: 'Giao dịch hôm nay',
      value: String(activity?.transactionCount ?? 0),
      detail: `${activity?.completedCount ?? 0} giao dịch hoàn tất`,
      icon: <ThunderboltOutlined />,
      tone: 'blue' as const,
    },
    {
      label: 'Giá trị giao dịch',
      value: formatVnd(activity?.transactionValueVnd ?? 0),
      detail: 'Quy đổi theo dữ liệu giao dịch',
      icon: <DollarOutlined />,
      tone: 'green' as const,
    },
    {
      label: 'Tiền vào',
      value: formatVnd(activity?.moneyInVnd ?? 0),
      detail: 'Bút toán quỹ đã ghi sổ',
      icon: <InboxOutlined />,
      tone: 'teal' as const,
    },
    {
      label: 'Tiền ra',
      value: formatVnd(activity?.moneyOutVnd ?? 0),
      detail: 'Bút toán quỹ đã ghi sổ',
      icon: <SwapOutlined />,
      tone: 'amber' as const,
    },
  ];

  if (!branchId) {
    return <Alert type="error" showIcon message="Tài khoản chưa được gắn với chi nhánh làm việc." />;
  }

  return (
    <Space direction="vertical" size={16} className="w-full">
      {(isFundsError || isActivityError) && (
        <Alert type="error" showIcon message="Không thể tải dữ liệu Dashboard chi nhánh" description="Vui lòng kiểm tra kết nối backend hoặc tải lại trang." />
      )}

      <BalanceOverviewCard
        loading={isFundsLoading}
        eyebrow={`Chi nhánh ${user?.branchName ?? branchId}`}
        amount={(funds?.currentFundValueVnd ?? 0).toLocaleString('vi-VN')}
        statusTag={{
          label: funds?.status === 'NEEDS_RECONCILIATION' ? 'Cần đối chiếu' : funds?.status === 'LOW_CASH' ? 'Âm quỹ' : 'Bình thường',
          color: funds?.status === 'NEEDS_RECONCILIATION' ? 'gold' : funds?.status === 'LOW_CASH' ? 'red' : 'green',
        }}
        caption={funds?.lastCashCountAt ? `Kiểm quỹ gần nhất ${formatDateTime(funds.lastCashCountAt)}` : 'Chưa có dữ liệu kiểm quỹ'}
        sparklineBars={sparkline(activity?.trend.map((item) => item.transactionValueVnd) ?? [])}
        subBalances={[
          { label: 'VND tiền mặt', value: formatVnd(funds?.vndCash ?? 0) },
          { label: 'USD tiền mặt', value: formatUsd(funds?.usdCash ?? 0) },
          { label: 'Quỹ A quy đổi', value: formatVnd(funds?.fundAValueVnd ?? 0) },
        ]}
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

      <KpiGrid items={kpis} loading={isActivityLoading} />

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={16} className="flex">
          <Card loading={isFundsLoading} title="Quỹ riêng chi nhánh" extra={<Typography.Text type="secondary">Dữ liệu ledger hiện tại</Typography.Text>} className="w-full">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <RateCard label="VND tiền mặt" value={formatVnd(funds?.vndCash ?? 0)} tone="green" />
              </Col>
              <Col xs={24} md={8}>
                <RateCard label="USD tiền mặt" value={formatUsd(funds?.usdCash ?? 0)} adjustment={funds?.usdBuyRate ? formatExchangeRate(funds.usdBuyRate) : 'Chưa có tỷ giá'} tone="green" />
              </Col>
              <Col xs={24} md={8}>
                <RateCard label="Quỹ A" value={`${funds?.fundA.length ?? 0} ngoại tệ`} change={formatVnd(funds?.fundAValueVnd ?? 0)} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} xl={8} className="flex">
          <Card
            title="Ca làm việc"
            className="w-full"
            extra={hasOpenShift ? (
              <Button danger icon={<PoweroffOutlined />} onClick={() => navigate('/shift-management/active-shift')}>Đóng ca</Button>
            ) : (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate('/shift-management/active-shift')}>Mở ca</Button>
            )}
          >
            {hasOpenShift ? (
              <>
                <Tag color="green">Đang mở</Tag>
                <Descriptions column={1} size="small" className="mt-4">
                  <Descriptions.Item label="Nhân viên">{currentShift?.openedBy}</Descriptions.Item>
                  <Descriptions.Item label="Mã ca">{currentShift?.code}</Descriptions.Item>
                  <Descriptions.Item label="Mở ca">{formatDateTime(currentShift?.openedAt)}</Descriptions.Item>
                </Descriptions>
              </>
            ) : (
              <Alert type="warning" showIcon message="Không có ca mở" description="Mở ca để thực hiện giao dịch WU, MG, ngoại tệ và chuyển tiền." />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={16} className="flex">
          <Card title="Danh sách Quỹ A" extra={<Tag>{funds?.fundA.length ?? 0} ngoại tệ</Tag>} loading={isFundsLoading} className="w-full">
            <Table columns={fundAColumns} dataSource={funds?.fundA ?? []} rowKey="currency" pagination={false} size="middle" locale={{ emptyText: 'Chưa có tồn Quỹ A' }} />
          </Card>
        </Col>
        <Col xs={24} xl={8} className="flex">
          <Card title="Cảnh báo vận hành" extra={<Tag color={alerts.length > 0 ? 'gold' : 'green'}>{alerts.length}</Tag>} className="w-full">
            {alerts.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có cảnh báo" />
            ) : (
              <Space direction="vertical" size={10} className="w-full">
                {alerts.map((alert, index) => <Alert key={`${alert.message}-${index}`} type={alert.type} showIcon message={alert.message} />)}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card loading={isActivityLoading} title="Cơ cấu giao dịch hôm nay" extra={<Typography.Text type="secondary">Tự cập nhật mỗi 15 giây</Typography.Text>}>
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}><RateCard label="Western Union" value={String(sourceCount('WU'))} change="giao dịch" tone="green" /></Col>
          <Col xs={12} md={6}><RateCard label="MoneyGram" value={String(sourceCount('MG'))} change="giao dịch" /></Col>
          <Col xs={12} md={6}><RateCard label="Ngoại tệ" value={String(sourceCount('FX'))} change="giao dịch" /></Col>
          <Col xs={12} md={6}><RateCard label="Chuyển tiền" value={String(sourceCount('DOMESTIC'))} change="giao dịch" /></Col>
        </Row>
      </Card>
    </Space>
  );
}
