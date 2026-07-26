import {
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  HistoryOutlined,
  SaveOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatExchangeRate,
  formatUsd,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { activeBankRateMock } from '@/modules/exchange-rate/data/exchangeRates.mock';
import { debtsMock } from '../data/debts.mock';
import type {
  DebtCurrency,
  DebtRecord,
  DebtSource,
  DebtStatus,
  UsdDebtResolutionForm,
  VndDebtResolutionForm,
} from '../model/debt.types';

const sourceMeta: Record<DebtSource, { label: string; color: string }> = {
  WU: { label: 'Western Union', color: 'blue' },
  MG: { label: 'MoneyGram', color: 'cyan' },
  BANK: { label: 'Ngân hàng', color: 'purple' },
  ADJUSTMENT: { label: 'Điều chỉnh', color: 'orange' },
};

const statusMeta: Record<DebtStatus, { label: string; color: string; icon: JSX.Element }> = {
  OPEN: { label: 'Đang mở', color: 'blue', icon: <ClockCircleOutlined /> },
  PARTIAL: { label: 'Một phần', color: 'gold', icon: <SyncOutlined /> },
  OVERDUE: { label: 'Quá hạn', color: 'red', icon: <ExclamationCircleOutlined /> },
  RESOLVED: { label: 'Đã xử lý', color: 'green', icon: <CheckCircleOutlined /> },
};

const debtCodeOptions = debtsMock
  .filter((debt) => debt.status !== 'RESOLVED')
  .map((debt) => ({
    value: debt.code,
    label: `${debt.code} - ${debt.currency} ${debt.currency === 'VND' ? formatVnd(debt.remainingAmount) : formatUsd(debt.remainingAmount)}`,
  }));

function formatDebtAmount(currency: DebtCurrency, amount: number) {
  return currency === 'VND' ? formatVnd(amount) : formatUsd(amount);
}

function splitUsdDebt(amount: number) {
  const integerUsdAmount = Math.trunc(amount);
  const oddUsdAmount = Number((amount - integerUsdAmount).toFixed(2));

  return {
    integerUsdAmount,
    oddUsdAmount,
    oddVndAmount: Math.round(oddUsdAmount * activeBankRateMock.usdToVnd),
  };
}

export function DebtManagementPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [usdForm] = Form.useForm<UsdDebtResolutionForm>();
  const [vndForm] = Form.useForm<VndDebtResolutionForm>();
  const [keyword, setKeyword] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | DebtCurrency>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DebtStatus>('ALL');
  const [isUsdModalOpen, setIsUsdModalOpen] = useState(false);
  const [isVndModalOpen, setIsVndModalOpen] = useState(false);

  const filteredDebts = useMemo(
    () =>
      debtsMock.filter((debt) => {
        const text = `${debt.code} ${debt.counterparty} ${debt.branch} ${debt.owner} ${debt.note}`.toLowerCase();
        const matchesKeyword = text.includes(keyword.toLowerCase());
        const matchesCurrency = currencyFilter === 'ALL' || debt.currency === currencyFilter;
        const matchesStatus = statusFilter === 'ALL' || debt.status === statusFilter;
        return matchesKeyword && matchesCurrency && matchesStatus;
      }),
    [currencyFilter, keyword, statusFilter],
  );

  const totalUsdDebt = debtsMock
    .filter((debt) => debt.currency === 'USD' && debt.status !== 'RESOLVED')
    .reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const totalVndDebt = debtsMock
    .filter((debt) => debt.currency === 'VND' && debt.status !== 'RESOLVED')
    .reduce((sum, debt) => sum + debt.remainingAmount, 0);
  const overdueCount = debtsMock.filter((debt) => debt.status === 'OVERDUE').length;
  const resolvedToday = debtsMock.filter((debt) => debt.status === 'RESOLVED').reduce((sum, debt) => sum + debt.resolvedAmount, 0);

  const submitUsdResolution = async (values: UsdDebtResolutionForm) => {
    await message.success(`Đã ghi nhận xử lý công nợ USD cho ${values.debtCode}`);
    usdForm.resetFields();
    setIsUsdModalOpen(false);
  };

  const submitVndResolution = async (values: VndDebtResolutionForm) => {
    await message.success(`Đã ghi nhận xử lý công nợ VND cho ${values.debtCode}`);
    vndForm.resetFields();
    setIsVndModalOpen(false);
  };

  const debtColumns: ColumnsType<DebtRecord> = [
    {
      title: 'Mã công nợ',
      dataIndex: 'code',
      fixed: 'left',
      width: 190,
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{record.lastUpdatedAt}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Nguồn', dataIndex: 'source', render: (value: DebtSource) => <Tag color={sourceMeta[value].color}>{sourceMeta[value].label}</Tag> },
    { title: 'Đối tượng', dataIndex: 'counterparty' },
    { title: 'Chi nhánh', dataIndex: 'branch' },
    {
      title: 'Còn lại',
      dataIndex: 'remainingAmount',
      align: 'right',
      render: (value: number, record) => <Typography.Text strong>{formatDebtAmount(record.currency, value)}</Typography.Text>,
    },
    {
      title: 'Đã xử lý',
      dataIndex: 'resolvedAmount',
      align: 'right',
      render: (value: number, record) => formatDebtAmount(record.currency, value),
    },
    { title: 'Tuổi nợ', dataIndex: 'ageInDays', align: 'center', render: (value: number) => `${value} ngày` },
    { title: 'Hạn xử lý', dataIndex: 'dueDate', align: 'center' },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      align: 'center',
      render: (value: DebtStatus) => <Tag color={statusMeta[value].color} icon={statusMeta[value].icon}>{statusMeta[value].label}</Tag>,
    },
    { title: 'Phụ trách', dataIndex: 'owner' },
    { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
  ];

  return (
    <PageScaffold
      title="Công Nợ"
      description="Theo dõi công nợ USD/VND, tuổi nợ, trạng thái xử lý và ghi nhận bù trừ theo ngân hàng hoặc tiền mặt."
      moduleName="debt-management"
      extra={(
        <Space wrap>
          <Button icon={<HistoryOutlined />} onClick={() => navigate('/debt-management/debt-history')}>Lịch sử</Button>
          <Button icon={<SyncOutlined />}>Đồng bộ công nợ</Button>
        </Space>
      )}
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="overflow-hidden bg-black! text-white!" classNames={{ body: 'p-0!' }}>
          <div className="p-6">
            <div className="mb-6 flex items-start justify-between gap-4 max-lg:flex-col">
              <div>
                <Typography.Text className="text-white/75! uppercase tracking-normal!">Tổng quan công nợ</Typography.Text>
                <Typography.Title level={2} className="mt-1! mb-2! text-white!">
                  {formatVnd(totalVndDebt)}
                </Typography.Title>
                <Typography.Text className="text-white/75!">
                  Công nợ VND đang mở · USD mở {formatUsd(totalUsdDebt)}
                </Typography.Text>
              </div>
              <Space wrap>
                <Button ghost icon={<DollarOutlined />} onClick={() => setIsUsdModalOpen(true)}>
                  Giải quyết USD
                </Button>
                <Button ghost icon={<BankOutlined />} onClick={() => setIsVndModalOpen(true)}>
                  Giải quyết VND
                </Button>
              </Space>
            </div>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Công nợ USD mở</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatUsd(totalUsdDebt)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Công nợ VND mở</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatVnd(totalVndDebt)}</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Quá hạn</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{overdueCount} khoản</div>
                </div>
              </Col>
              <Col xs={24} md={12} xl={6}>
                <div className="rounded border border-white/20 bg-white/10 p-4">
                  <Typography.Text className="text-white/70!">Đã xử lý gần nhất</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold">{formatVnd(resolvedToday)}</div>
                </div>
              </Col>
            </Row>
          </div>
        </Card>

        <Modal
          title={<Space><DollarOutlined />Giải quyết công nợ USD</Space>}
          open={isUsdModalOpen}
          onCancel={() => setIsUsdModalOpen(false)}
          footer={null}
          width={820}
          destroyOnHidden
        >
          <Tag color="blue" className="mb-4!">Tiền mặt + phần lẻ quy đổi</Tag>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message={`Đang áp dụng tỷ giá ngân hàng đã duyệt: ${formatExchangeRate(activeBankRateMock.usdToVnd)} VND/USD`}
            description={`${activeBankRateMock.bank} · ${activeBankRateMock.version} · Duyệt bởi ${activeBankRateMock.approvedBy} lúc ${activeBankRateMock.approvedAt}`}
          />
              <Form
                form={usdForm}
                layout="vertical"
                onFinish={submitUsdResolution}
                initialValues={{ bankRate: activeBankRateMock.usdToVnd }}
                onValuesChange={(changedValues: Partial<UsdDebtResolutionForm>, values) => {
                  if ('debtCode' in changedValues) {
                    const selectedDebt = debtsMock.find((debt) => debt.code === changedValues.debtCode);

                    if (selectedDebt?.currency === 'USD') {
                      const resolvedSplit = splitUsdDebt(selectedDebt.remainingAmount);
                      usdForm.setFieldsValue({
                        cashUsdAmount: resolvedSplit.integerUsdAmount,
                        oddUsdAmount: resolvedSplit.oddUsdAmount,
                        oddVndAmount: resolvedSplit.oddVndAmount,
                        bankRate: activeBankRateMock.usdToVnd,
                      });
                    }
                    return;
                  }

                  if ('oddUsdAmount' in changedValues || 'bankRate' in changedValues) {
                    usdForm.setFieldValue('oddVndAmount', Math.round((values.oddUsdAmount ?? 0) * activeBankRateMock.usdToVnd));
                  }
                }}
              >
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item name="debtCode" label="Khoản công nợ" rules={[{ required: true, message: 'Chọn khoản công nợ USD' }]}>
                      <Select
                        showSearch
                        placeholder="Chọn mã công nợ"
                        options={debtCodeOptions.filter((option) => debtsMock.find((debt) => debt.code === option.value)?.currency === 'USD')}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="cashUsdAmount" label="Phần nguyên USD xử lý tiền mặt" rules={[{ required: true, message: 'Thiếu phần nguyên USD' }]}>
                      <InputNumber className="w-full" min={0} precision={0} addonAfter="USD" readOnly controls={false} formatter={usdInputFormatter} parser={usdInputParser} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="bankRate" label="Tỷ giá ngân hàng đã duyệt" rules={[{ required: true, message: 'Thiếu tỷ giá ngân hàng' }]}>
                      <InputNumber className="w-full" min={0} precision={0} addonAfter="VND/USD" readOnly controls={false} formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="oddUsdAmount" label="Phần lẻ USD">
                      <InputNumber className="w-full" min={0} precision={2} addonAfter="USD" readOnly controls={false} formatter={usdInputFormatter} parser={usdInputParser} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item name="oddVndAmount" label="Quy đổi VND">
                      <InputNumber className="w-full" min={0} precision={0} addonAfter="VND" readOnly controls={false} formatter={numberInputFormatter} parser={numberInputParser} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name="reason" label="Diễn giải" rules={[{ required: true, message: 'Nhập diễn giải xử lý' }]}>
                      <Input.TextArea rows={3} placeholder="Ví dụ: thu tiền mặt USD, phần lẻ quy đổi theo tỷ giá ngân hàng..." />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Ghi nhận xử lý USD</Button>
              </Form>
        </Modal>

        <Modal
          title={<Space><BankOutlined />Giải quyết công nợ VND</Space>}
          open={isVndModalOpen}
          onCancel={() => setIsVndModalOpen(false)}
          footer={null}
          width={820}
          destroyOnHidden
        >
          <Tag color="purple" className="mb-4!">Ngân hàng</Tag>
              <Form form={vndForm} layout="vertical" onFinish={submitVndResolution}>
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item name="debtCode" label="Khoản công nợ" rules={[{ required: true, message: 'Chọn khoản công nợ VND' }]}>
                      <Select
                        showSearch
                        placeholder="Chọn mã công nợ"
                        options={debtCodeOptions.filter((option) => debtsMock.find((debt) => debt.code === option.value)?.currency === 'VND')}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="bankAccount" label="Tài khoản ngân hàng" rules={[{ required: true, message: 'Chọn tài khoản' }]}>
                      <Select
                        placeholder="Chọn tài khoản xử lý"
                        options={[
                          { value: 'ACB_TK1', label: 'ACB TK1 - Quỹ Chung' },
                          { value: 'ACB_TK2', label: 'ACB TK2 - MG' },
                          { value: 'MSB_TK1', label: 'MSB TK1 - Quỹ Chung' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="transferAmount" label="Số tiền chuyển khoản" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                      <InputNumber className="w-full" min={0} precision={0} addonAfter="VND" formatter={numberInputFormatter} parser={numberInputParser} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="referenceCode" label="Mã tham chiếu ngân hàng" rules={[{ required: true, message: 'Nhập mã tham chiếu' }]}>
                      <Input placeholder="VD: ACB2606260001" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="fee" label="Phí ngân hàng">
                      <InputNumber className="w-full" min={0} precision={0} addonAfter="VND" formatter={numberInputFormatter} parser={numberInputParser} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name="reason" label="Diễn giải" rules={[{ required: true, message: 'Nhập diễn giải xử lý' }]}>
                      <Input.TextArea rows={3} placeholder="Ví dụ: bù trừ công nợ qua ACB TK1, kèm mã giao dịch ngân hàng..." />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Ghi nhận xử lý VND</Button>
              </Form>
        </Modal>

        <Card>
          <Row gutter={[12, 12]} align="middle" className="mb-4">
            <Col xs={24} lg={10}>
              <Input.Search
                allowClear
                placeholder="Tìm mã công nợ, đối tượng, chi nhánh..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select
                className="w-full"
                value={currencyFilter}
                onChange={setCurrencyFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả tiền tệ' },
                  { value: 'USD', label: 'USD' },
                  { value: 'VND', label: 'VND' },
                ]}
              />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select
                className="w-full"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
                ]}
              />
            </Col>
            <Col xs={24} lg={4}>
              <Button className="w-full" icon={<FilterOutlined />}>Bộ lọc nâng cao</Button>
            </Col>
          </Row>

          <Table
            columns={debtColumns}
            dataSource={filteredDebts}
            scroll={{ x: 1500 }}
            pagination={{ pageSize: 8 }}
          />
        </Card>
      </Space>
    </PageScaffold>
  );
}
