import {
  ArrowRightOutlined,
  BankOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  FieldTimeOutlined,
  LineChartOutlined,
  PlusOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Empty, Form, Input, Modal, Row, Segmented, Select, Space, Steps, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { FundBalanceTable } from '@/shared/components/FundBalanceTable';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import { SectionCardTitle } from '@/shared/components/SectionCardTitle';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import {
  formatExchangeRate,
  formatDateTime,
  formatVnd,
} from '@/shared/utils/formatters';
import type { BranchFundStatus, CreateBranchPayload, FundCurrencyBalanceDto, MonitoringPeriod } from '../api/branchMonitoring.api';
import { useBranchActivity, useBranchFunds, useCreateBranch, useMonitoringBranches } from '../hooks/useBranchMonitoring';

const periodOptions = [
  { label: 'Ngày', value: 'day' },
  { label: 'Tháng', value: 'month' },
  { label: 'Năm', value: 'year' },
];

const statusMeta: Record<BranchFundStatus, { label: string; color: string }> = {
  NORMAL: { label: 'Ổn định', color: 'green' },
  LOW_CASH: { label: 'Thiếu quỹ', color: 'gold' },
  NEEDS_RECONCILIATION: { label: 'Cần kiểm quỹ', color: 'red' },
};

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    return Array.isArray(message) ? message.join(', ') : message || 'Không thể tạo chi nhánh';
  }
  return 'Không thể tạo chi nhánh';
}

function BranchShiftRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="branch-monitor-shift__row">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text strong>{value}</Typography.Text>
    </div>
  );
}

export function BranchMonitoringPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const [branchForm] = Form.useForm<CreateBranchPayload>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [period, setPeriod] = useState<MonitoringPeriod>('day');
  const [branchId, setBranchId] = useState('');
  const anchorDate = dayjs().format('YYYY-MM-DD');
  const { data: branches = [], isLoading: isBranchesLoading, isError: isBranchesError } = useMonitoringBranches();
  const { data: funds, isLoading: isFundsLoading, isError: isFundsError } = useBranchFunds(branchId);
  const { data: activity, isLoading: isActivityLoading, isError: isActivityError } = useBranchActivity(branchId, period, anchorDate);
  const createBranch = useCreateBranch();

  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(branches[0].id);
  }, [branchId, branches]);

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const branchOptions = branches.map((branch) => ({
    value: branch.id,
    label: `${branch.code} - ${branch.name}`,
  }));
  const trend = activity?.trend ?? [];
  const branchFundBalances = useMemo<FundCurrencyBalanceDto[]>(() => {
    if (!funds) return [];

    return [
      { currency: 'VND', name: 'Việt Nam đồng', amount: funds.vndCash, buyRate: 1, vndValue: funds.vndCash },
      { currency: 'USD', name: 'Đô la Mỹ', amount: funds.usdCash, buyRate: funds.usdBuyRate, vndValue: funds.usdCash * funds.usdBuyRate },
      ...funds.fundA.filter((balance) => !['VND', 'USD'].includes(balance.currency)),
    ];
  }, [funds]);

  const submitBranch = async () => {
    try {
      const values = await branchForm.validateFields();
      const created = await createBranch.mutateAsync(values);
      message.success('Đã tạo chi nhánh, chuyển sang lập phiếu tiếp quỹ');
      setCreateModalOpen(false);
      branchForm.resetFields();
      navigate(`/fund-transfer?destinationBranchId=${encodeURIComponent(created.id)}&origin=branch-creation`);
    } catch (error) {
      if (!('errorFields' in (error as object))) message.error(getErrorMessage(error));
    }
  };

  const fundBalanceRows = branchFundBalances.map((item) => ({
    key: item.currency,
    currencyCode: item.currency,
    accountType: item.currency === 'VND' || item.currency === 'USD' ? 'CASH' : 'FUND_A',
    accountName: item.currency === 'VND' || item.currency === 'USD' ? `Tiền mặt ${item.currency}` : item.name,
    balance: item.amount,
  }));

  return (
    <PageScaffold
      title="Chi Nhánh"
      description="Giám đốc/KTTH theo dõi quỹ hiện tại và giao dịch theo ngày, tháng, năm của từng chi nhánh."
      moduleName="branch-management"
      extra={(
        role === 'director' ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            Thêm chi nhánh
          </Button>
        ) : undefined
      )}
    >
      {isBranchesError ? (
        <Alert type="error" showIcon message="Không thể tải danh sách chi nhánh" description="Vui lòng kiểm tra kết nối backend hoặc tải lại trang." />
      ) : !isBranchesLoading && branches.length === 0 ? (
        <Card><Empty description="Không có chi nhánh đang hoạt động" /></Card>
      ) : (
        <Space direction="vertical" size={16} className="w-full">
          {(isFundsError || isActivityError) && (
            <Alert type="error" showIcon message="Không thể tải đầy đủ dữ liệu chi nhánh" description="Vui lòng kiểm tra kết nối backend hoặc tải lại trang." />
          )}

          <div className="branch-monitor-toolbar">
            <div className="branch-monitor-toolbar__field branch-monitor-toolbar__field--branch">
              <Typography.Text>Chi nhánh theo dõi</Typography.Text>
              <Select
                value={branchId || undefined}
                loading={isBranchesLoading}
                placeholder="Chọn chi nhánh"
                options={branchOptions}
                onChange={setBranchId}
                showSearch
                optionFilterProp="label"
              />
            </div>
            <div className="branch-monitor-toolbar__field">
              <Typography.Text>Khoảng thời gian</Typography.Text>
              <Segmented value={period} options={periodOptions} onChange={(value) => setPeriod(value as MonitoringPeriod)} />
            </div>
            <div className="branch-monitor-toolbar__date">
              <CalendarOutlined />
              <div>
                <Typography.Text>Ngày tham chiếu</Typography.Text>
                <strong>{dayjs(anchorDate).format('DD/MM/YYYY')}</strong>
              </div>
            </div>
          </div>

          <OperationalOverviewCard
            loading={isFundsLoading || isActivityLoading}
            eyebrow="Chi nhánh đang theo dõi"
            title={selectedBranch?.name ?? 'Đang tải chi nhánh'}
            icon={<BankOutlined />}
            meta={(
              <Space size={8} wrap>
                <Typography.Text className="operational-code">{selectedBranch?.code ?? '—'}</Typography.Text>
                <Typography.Text><TeamOutlined /> {selectedBranch?.employeeCount ?? 0} nhân viên</Typography.Text>
              </Space>
            )}
            aside={(
              <div className="branch-monitor-overview__total">
                <Typography.Text>Tổng quỹ hiện tại</Typography.Text>
                <strong>{formatVnd(funds?.currentFundValueVnd ?? 0)}</strong>
                <span>Paid mua USD: {funds?.usdBuyRate ? formatExchangeRate(funds.usdBuyRate) : 'Chưa có tỷ giá'}</span>
              </div>
            )}
            metrics={[
              { icon: <WalletOutlined />, label: 'Tiền mặt VND', value: formatVnd(funds?.vndCash ?? 0), note: 'Tồn tại chi nhánh' },
              { icon: <DollarOutlined />, label: 'Tiền mặt USD', value: `${(funds?.usdCash ?? 0).toLocaleString('en-US')} USD`, note: 'Tồn tại chi nhánh' },
              { icon: <BarChartOutlined />, label: 'Số giao dịch', value: String(activity?.transactionCount ?? 0), note: `${activity?.completedCount ?? 0} giao dịch hoàn tất` },
              { icon: <BankOutlined />, label: 'Giá trị giao dịch', value: formatVnd(activity?.transactionValueVnd ?? 0), note: 'Theo kỳ đang chọn' },
            ]}
          />

          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} xl={16} className="flex">
              <Card loading={isActivityLoading} title={<SectionCardTitle icon={<LineChartOutlined />}>Dòng tiền vào/ra</SectionCardTitle>} extra={<Tag>{periodOptions.find((item) => item.value === period)?.label}</Tag>} className="branch-monitor-chart w-full">
                <div className="branch-monitor-chart__canvas">
                  {trend.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} width={54} tickFormatter={(value) => `${Math.round(Number(value) / 1_000_000)}M`} />
                        <Tooltip formatter={(value: number) => formatVnd(Number(value))} contentStyle={{ borderRadius: 6, borderColor: '#e5e7eb' }} />
                        <Legend />
                        <Line type="monotone" dataKey="moneyInVnd" name="Tiền vào" stroke="#059669" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="moneyOutVnd" name="Tiền ra" stroke="#dc2626" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <Empty className="branch-monitor-chart__empty" description="Chưa có dòng tiền trong kỳ" />}
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={8} className="flex">
              <Card loading={isFundsLoading} title={<SectionCardTitle icon={<FieldTimeOutlined />}>Trạng thái ca</SectionCardTitle>} className="branch-monitor-shift w-full">
                {funds?.openShift ? (
                  <div className="branch-monitor-shift__content">
                    <div className="branch-monitor-shift__status">
                      <span><CheckCircleOutlined /></span>
                      <div>
                        <Typography.Text>Ca đang hoạt động</Typography.Text>
                        <strong>{funds.openShift.code}</strong>
                      </div>
                    </div>
                    <BranchShiftRow label="Giao dịch viên" value={funds.openShift.cashier} />
                    <BranchShiftRow label="Thời gian mở" value={formatDateTime(funds.openShift.openedAt)} />
                    <BranchShiftRow label="Chờ tiếp quỹ" value={`${funds.pendingTransferCount} phiếu`} />
                  </div>
                ) : (
                  <div className="branch-monitor-shift__closed">
                    <FieldTimeOutlined />
                    <Typography.Text strong>Không có ca mở</Typography.Text>
                    <Typography.Text type="secondary">Chi nhánh hiện không thực hiện giao dịch theo ca.</Typography.Text>
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Card
            loading={isFundsLoading}
            title={<SectionCardTitle icon={<WalletOutlined />}>Chi tiết tồn quỹ</SectionCardTitle>}
            extra={funds && <Tag color={statusMeta[funds.status].color}>{statusMeta[funds.status].label}</Tag>}
            className="polished-card"
          >
            <FundBalanceTable items={fundBalanceRows} emptyText="Chi nhánh chưa có số dư quỹ" />
          </Card>
        </Space>
      )}

      <Modal
        title="Khởi tạo chi nhánh"
        open={createModalOpen}
        width={680}
        onCancel={() => setCreateModalOpen(false)}
        destroyOnClose
        footer={(
          <Space>
            <Button onClick={() => setCreateModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              loading={createBranch.isPending}
              onClick={submitBranch}
            >
              Tạo và chuyển sang Tiếp quỹ
            </Button>
          </Space>
        )}
      >
        <Steps
          className="mt-2! mb-6!"
          size="small"
          current={0}
          items={[
            { title: 'Khởi tạo chi nhánh' },
            { title: 'Tiếp quỹ ban đầu' },
          ]}
        />
        <Form form={branchForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col xs={24} md={9}>
              <Form.Item
                name="code"
                label="Mã chi nhánh"
                rules={[
                  { required: true, message: 'Vui lòng nhập mã chi nhánh' },
                  { pattern: /^[A-Za-z0-9_]+$/, message: 'Chỉ dùng chữ, số và dấu gạch dưới' },
                ]}
              >
                <Input
                  size="large"
                  placeholder="VD: NCT"
                  onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={15}>
              <Form.Item
                name="name"
                label="Tên chi nhánh"
                rules={[{ required: true, message: 'Vui lòng nhập tên chi nhánh' }]}
              >
                <Input size="large" placeholder="Chi nhánh Nguyễn Chí Thanh" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Địa chỉ">
            <Input size="large" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[{ pattern: /^[0-9+(). -]*$/, message: 'Số điện thoại không hợp lệ' }]}
          >
            <Input size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  );
}
