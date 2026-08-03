import {
  ArrowRightOutlined,
  BankOutlined,
  BarChartOutlined,
  FieldTimeOutlined,
  LineChartOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Empty, Form, Input, Modal, Row, Segmented, Select, Space, Statistic, Steps, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
import { useAuthStore } from '@/modules/auth/model/auth.store';
import {
  formatExchangeRate,
  formatDateTime,
  formatNumber,
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

export function BranchMonitoringPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const [branchForm] = Form.useForm<CreateBranchPayload>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [period, setPeriod] = useState<MonitoringPeriod>('day');
  const [branchId, setBranchId] = useState('');
  const anchorDate = dayjs().format('YYYY-MM-DD');
  const { data: branches = [], isLoading: isBranchesLoading } = useMonitoringBranches();
  const { data: funds, isLoading: isFundsLoading } = useBranchFunds(branchId);
  const { data: activity, isLoading: isActivityLoading } = useBranchActivity(branchId, period, anchorDate);
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

  const fundAColumns: ColumnsType<FundCurrencyBalanceDto> = [
    {
      title: 'Ngoại tệ',
      dataIndex: 'currency',
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">{record.name}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Số lượng', dataIndex: 'amount', align: 'right', render: (value: number) => formatNumber(value) },
    { title: 'Đơn vị', dataIndex: 'currency', align: 'center', render: (value: string) => <Tag>{value}</Tag> },
  ];

  return (
    <PageScaffold
      title="Chi Nhánh"
      description="Giám đốc/KTTH theo dõi quỹ hiện tại và giao dịch theo ngày, tháng, năm của từng chi nhánh."
      moduleName="branch-management"
      extra={(
        <Space wrap>
          {role === 'director' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              Thêm chi nhánh
            </Button>
          )}
          <Segmented value={period} options={periodOptions} onChange={(value) => setPeriod(value as MonitoringPeriod)} />
          <Select
            className="min-w-72"
            value={branchId || undefined}
            loading={isBranchesLoading}
            placeholder="Chọn chi nhánh"
            options={branchOptions}
            onChange={setBranchId}
          />
        </Space>
      )}
    >
      {!isBranchesLoading && branches.length === 0 ? (
        <Card><Empty description="Không có chi nhánh đang hoạt động" /></Card>
      ) : (
        <Space direction="vertical" size={16} className="w-full">
          <Card loading={isFundsLoading || isActivityLoading} className="branch-monitor-hero polished-card" classNames={{ body: 'p-0!' }}>
            <div className="grid xl:grid-cols-[1.2fr_1.8fr]">
              <div className="border-b border-white/10 p-6 xl:border-r xl:border-b-0">
                <Typography.Text className="text-white/65! text-xs! font-semibold! uppercase">Tổng quỹ hiện tại</Typography.Text>
                <Typography.Title level={2} className="mt-2! mb-2! text-white!">{formatVnd(funds?.currentFundValueVnd ?? 0)}</Typography.Title>
                <Typography.Text className="text-white/70!">
                  Quy đổi USD theo Paid mua {funds?.usdBuyRate ? formatExchangeRate(funds.usdBuyRate) : 'chưa có tỷ giá'}.
                </Typography.Text>
              </div>
              <Row gutter={[12, 12]} className="p-6">
                <Col xs={24} md={8}>
                  <Statistic title="Số giao dịch" value={activity?.transactionCount ?? 0} prefix={<BarChartOutlined />} />
                  <Typography.Text className="text-white/60! text-xs!">{activity?.completedCount ?? 0} giao dịch hoàn tất</Typography.Text>
                </Col>
                <Col xs={24} md={8}>
                  <Statistic title="Giá trị giao dịch" value={activity?.transactionValueVnd ?? 0} formatter={(value) => formatVnd(Number(value))} prefix={<BankOutlined />} />
                  <Typography.Text className="text-white/60! text-xs!">Theo kỳ lọc</Typography.Text>
                </Col>
                <Col xs={24} md={8}>
                  <Statistic title="Nhân viên" value={selectedBranch?.employeeCount ?? 0} suffix="người" prefix={<TeamOutlined />} />
                  <Typography.Text className="text-white/60! text-xs!">Đang hoạt động tại chi nhánh</Typography.Text>
                </Col>
              </Row>
            </div>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={15}>
              <Card loading={isActivityLoading} title={<Space><LineChartOutlined />Xu hướng giao dịch</Space>} className="polished-card">
                <div className="h-80">
                  {trend.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" />
                        <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1_000_000)}M`} />
                        <Tooltip formatter={(value: number) => formatVnd(Number(value))} />
                        <Legend />
                        <Line type="monotone" dataKey="moneyInVnd" name="Tiền vào" stroke="#047857" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="moneyOutVnd" name="Tiền ra" stroke="#be123c" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <Empty className="pt-20" description="Chưa có giao dịch trong kỳ" />}
                </div>
              </Card>
            </Col>
            <Col xs={24} xl={9}>
              <Card loading={isFundsLoading} title={<Space><FieldTimeOutlined />Thông tin ca</Space>} className="polished-card h-full">
                {funds?.openShift ? (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Typography.Text type="secondary" className="text-xs! font-semibold! uppercase">Ca đang mở</Typography.Text>
                        <Typography.Title level={3} className="mt-1! mb-0!">{funds.openShift.code}</Typography.Title>
                      </div>
                      <Tag color="green">Đang mở</Tag>
                    </div>
                    <Descriptions
                      bordered
                      size="small"
                      column={1}
                      items={[
                        { key: 'cashier', label: 'Giao dịch viên', children: funds.openShift.cashier },
                        { key: 'openedAt', label: 'Thời gian mở', children: formatDateTime(funds.openShift.openedAt) },
                      ]}
                    />
                  </div>
                ) : (
                  <Empty className="py-20" description="Không có ca mở" />
                )}
              </Card>
            </Col>
          </Row>

          <Card
            loading={isFundsLoading}
            title="Tồn quỹ chi nhánh"
            extra={funds && <Tag color={statusMeta[funds.status].color}>{statusMeta[funds.status].label}</Tag>}
            className="polished-card"
          >
            <Table
              columns={fundAColumns}
              dataSource={branchFundBalances}
              rowKey="currency"
              pagination={false}
              locale={{ emptyText: 'Chi nhánh chưa có số dư quỹ' }}
            />
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
