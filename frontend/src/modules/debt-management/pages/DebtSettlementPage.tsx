import { useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BankOutlined, DollarOutlined, EyeOutlined, PayCircleOutlined } from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import {
  formatCurrency, formatExchangeRate, numberInputFormatter, numberInputParser,
} from '@/shared/utils/formatters';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
import { useBankAccounts, useReceiveMoney } from '@/modules/bank-management/hooks/useBank';
import { useBranches, useDebtMovements, useDebts, useSettleUsdCashDebt } from '../hooks/useDebts';
import type { DebtAccountSummaryDto, DebtStatus, ListDebtsParams } from '../api/debt.api';

const { RangePicker } = DatePicker;

const STATUS: Record<DebtStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: 'Chưa xử lý' },
  PARTIALLY_SETTLED: { color: 'blue', label: 'Đã xử lý một phần' },
  SETTLED: { color: 'green', label: 'Hoàn tất' },
};

const toDateLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN', { timeZone: 'UTC' });

interface SettlementForm {
  amount?: number;
  cashUsdAmount?: number;
  oddUsdAmount?: number;
  bankAccountId?: string;
  bankReference?: string;
  description?: string;
}

export function DebtSettlementPage() {
  const { message } = App.useApp();
  const role = useAuthStore((state) => state.user?.role);
  const canSettle = hasPermission(role, 'fund.transfer');
  const [query, setQuery] = useState<ListDebtsParams>({});
  const [status, setStatus] = useState<DebtStatus | 'ALL'>('ALL');
  const [settlementCurrency, setSettlementCurrency] = useState<'USD' | 'VND' | null>(null);
  const [settleTarget, setSettleTarget] = useState<DebtAccountSummaryDto | null>(null);
  const [movementTarget, setMovementTarget] = useState<DebtAccountSummaryDto | null>(null);
  const [settleForm] = Form.useForm<SettlementForm>();

  const { data: debts = [], isLoading } = useDebts(query);
  const { data: branches = [] } = useBranches();
  const { data: movements = [], isLoading: isLoadingMovements } = useDebtMovements(movementTarget?.id ?? null);
  const settleUsdCash = useSettleUsdCashDebt();
  const receiveMoney = useReceiveMoney();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: activeRates = [] } = useActiveRates();
  const oddUsdAmount = Form.useWatch('oddUsdAmount', settleForm) ?? 0;
  const bankRate = activeRates.find((rate) => (
    rate.rateType === 'BANK_RATE' && rate.fromCurrency === 'USD' && rate.toCurrency === 'VND'
  ));

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const visibleDebts = useMemo(
    () => status === 'ALL' ? debts : debts.filter((debt) => debt.status === status),
    [debts, status],
  );
  const totals = useMemo(() => ({
    open: debts.filter((debt) => debt.outstanding > 0).length,
    partial: debts.filter((debt) => debt.status === 'PARTIALLY_SETTLED').length,
    settled: debts.filter((debt) => debt.status === 'SETTLED').length,
    outstandingVnd: debts
      .filter((debt) => debt.currencyCode === 'VND')
      .reduce((sum, debt) => sum + debt.outstanding, 0),
    outstandingUsd: debts
      .filter((debt) => debt.currencyCode === 'USD')
      .reduce((sum, debt) => sum + debt.outstanding, 0),
  }), [debts]);

  const openSettlement = (debt: DebtAccountSummaryDto) => {
    setSettlementCurrency(debt.currencyCode as 'USD' | 'VND');
    setSettleTarget(debt);
    settleForm.resetFields();
    if (debt.currencyCode === 'USD') {
      const cashUsdAmount = Math.trunc(debt.outstanding);
      settleForm.setFieldsValue({
        cashUsdAmount,
        oddUsdAmount: Number((debt.outstanding - cashUsdAmount).toFixed(2)),
      });
    } else {
      settleForm.setFieldsValue({ amount: debt.outstanding });
    }
  };

  const openSettlementPicker = (currency: 'USD' | 'VND') => {
    settleForm.resetFields();
    setSettleTarget(null);
    setSettlementCurrency(currency);
  };

  const closeSettlement = () => {
    settleForm.resetFields();
    setSettleTarget(null);
    setSettlementCurrency(null);
  };

  const settlementOptions = debts
    .filter((debt) => debt.currencyCode === settlementCurrency && debt.outstanding > 0)
    .map((debt) => ({
      value: debt.id,
      label: `${toDateLabel(debt.businessDate)} - ${debt.providerCode} - ${branchById.get(debt.branchId) ?? debt.branchId} - ${formatCurrency(debt.outstanding, debt.currencyCode)}`,
    }));

  const submitSettlement = async (values: SettlementForm) => {
    if (!settleTarget) return;
    try {
      if (settleTarget.currencyCode === 'USD') {
        await settleUsdCash.mutateAsync({
          id: settleTarget.id,
          cashUsdAmount: values.cashUsdAmount ?? 0,
          oddUsdAmount: values.oddUsdAmount ?? 0,
          description: values.description,
        });
      } else {
        if (!values.bankAccountId || !values.amount) return;
        await receiveMoney.mutateAsync({
          debtAccountId: settleTarget.id,
          bankAccountId: values.bankAccountId,
          amount: values.amount,
          bankReference: values.bankReference,
          description: values.description,
        });
      }
      message.success('Đã ghi nhận xử lý công nợ');
      closeSettlement();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? 'Không thể xử lý công nợ');
    }
  };

  const columns: ColumnsType<DebtAccountSummaryDto> = [
    {
      title: 'Ngày công nợ',
      dataIndex: 'businessDate',
      fixed: 'left',
      width: 125,
      render: toDateLabel,
    },
    {
      title: 'Đối tác',
      dataIndex: 'providerCode',
      width: 90,
      render: (value: string) => <Tag color={value === 'WU' ? 'blue' : 'cyan'}>{value}</Tag>,
    },
    {
      title: 'Chi nhánh',
      dataIndex: 'branchId',
      width: 190,
      render: (value: string) => branchById.get(value) ?? value,
    },
    { title: 'Loại tiền', dataIndex: 'currencyCode', width: 95, align: 'center' },
    {
      title: 'Phát sinh',
      dataIndex: 'totalDebt',
      align: 'right',
      width: 165,
      render: (value: number, record) => formatCurrency(value, record.currencyCode),
    },
    {
      title: 'Đã xử lý',
      dataIndex: 'totalSettled',
      align: 'right',
      width: 165,
      render: (value: number, record) => formatCurrency(value, record.currencyCode),
    },
    {
      title: 'Còn lại',
      dataIndex: 'outstanding',
      align: 'right',
      width: 165,
      render: (value: number, record) => (
        <Typography.Text strong type={value > 0 ? 'danger' : undefined}>
          {formatCurrency(value, record.currencyCode)}
        </Typography.Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 155,
      render: (value: DebtStatus) => <Tag color={STATUS[value].color}>{STATUS[value].label}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      width: 205,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setMovementTarget(record)}>
            Lịch sử
          </Button>
          {canSettle && record.outstanding > 0 && (
            <Button type="primary" size="small" icon={<PayCircleOutlined />} onClick={() => openSettlement(record)}>
              Xử lý
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Công Nợ Theo Ngày"
      description="Mỗi ngày, chi nhánh, đối tác và loại tiền có một khoản công nợ; các giao dịch phát sinh được cộng dồn và xử lý trực tiếp tại đây."
      moduleName="debt-management"
    >
      <Space direction="vertical" size={16} className="w-full">
        <Card className="overflow-hidden bg-black! text-white!" classNames={{ body: 'p-5!' }}>
          <div className="mb-5 flex flex-col gap-3 border-b border-white/15 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Typography.Title level={4} className="m-0! text-white!">Tổng quan công nợ</Typography.Title>
              <Typography.Text className="text-white/65!">Chọn loại tiền để xử lý các khoản công nợ đang mở.</Typography.Text>
            </div>
            {canSettle && (
              <Space wrap>
                <Button
                  className="border-[#f5b301]! bg-[#f5b301]! text-black! shadow-sm"
                  icon={<DollarOutlined />}
                  onClick={() => openSettlementPicker('USD')}
                >
                  Giải quyết USD
                </Button>
                <Button
                  className="border-[#f5b301]! bg-[#f5b301]! text-black! shadow-sm"
                  icon={<BankOutlined />}
                  onClick={() => openSettlementPicker('VND')}
                >
                  Giải quyết VND
                </Button>
              </Space>
            )}
          </div>
          <Row gutter={[16, 16]}>
            <Col xs={12} lg={4}><Statistic title={<span className="text-white/65">Đang mở</span>} value={totals.open} valueStyle={{ color: '#f5b301' }} suffix="khoản" /></Col>
            <Col xs={12} lg={4}><Statistic title={<span className="text-white/65">Một phần</span>} value={totals.partial} valueStyle={{ color: '#fff' }} suffix="khoản" /></Col>
            <Col xs={12} lg={4}><Statistic title={<span className="text-white/65">Hoàn tất</span>} value={totals.settled} valueStyle={{ color: '#fff' }} suffix="khoản" /></Col>
            <Col xs={24} sm={12} lg={6}><Statistic title={<span className="text-white/65">Còn nợ VND</span>} value={totals.outstandingVnd} formatter={(value) => formatCurrency(Number(value), 'VND')} valueStyle={{ color: '#fff' }} /></Col>
            <Col xs={24} sm={12} lg={6}><Statistic title={<span className="text-white/65">Còn nợ USD</span>} value={totals.outstandingUsd} precision={2} suffix="USD" valueStyle={{ color: '#fff' }} /></Col>
          </Row>
        </Card>

        <Card>
          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={24} lg={7}>
              <RangePicker
                className="w-full"
                format="DD/MM/YYYY"
                placeholder={['Từ ngày', 'Đến ngày']}
                onChange={(dates) => setQuery((current) => ({
                  ...current,
                  dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
                  dateTo: dates?.[1]?.format('YYYY-MM-DD'),
                }))}
              />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select
                className="w-full"
                allowClear
                placeholder="Tất cả chi nhánh"
                options={branches.map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` }))}
                onChange={(branchId) => setQuery((current) => ({ ...current, branchId }))}
              />
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Select className="w-full" allowClear placeholder="Đối tác" options={['WU', 'MG'].map((value) => ({ value, label: value }))} onChange={(providerCode) => setQuery((current) => ({ ...current, providerCode }))} />
            </Col>
            <Col xs={12} sm={6} lg={3}>
              <Select className="w-full" allowClear placeholder="Loại tiền" options={['USD', 'VND'].map((value) => ({ value, label: value }))} onChange={(currencyCode) => setQuery((current) => ({ ...current, currencyCode }))} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Select
                className="w-full"
                value={status}
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  ...Object.entries(STATUS).map(([value, meta]) => ({ value, label: meta.label })),
                ]}
                onChange={setStatus}
              />
            </Col>
          </Row>

          <Table<DebtAccountSummaryDto>
            rowKey="id"
            loading={isLoading}
            columns={columns}
            dataSource={visibleDebts}
            scroll={{ x: 1400 }}
            pagination={{ pageSize: 12, showSizeChanger: true }}
          />
        </Card>
      </Space>

      <Modal
        title={`Giải quyết công nợ ${settlementCurrency ?? ''}`}
        open={!!settlementCurrency}
        onCancel={closeSettlement}
        onOk={() => settleForm.submit()}
        confirmLoading={settleUsdCash.isPending || receiveMoney.isPending}
        okText="Xác nhận xử lý"
        okButtonProps={{ disabled: !settleTarget || (settlementCurrency === 'USD' && !bankRate) }}
        destroyOnHidden
      >
        <div className="mb-4">
          <Typography.Text strong>Khoản công nợ theo ngày</Typography.Text>
          <Select
            className="mt-2 w-full"
            showSearch
            optionFilterProp="label"
            value={settleTarget?.id}
            placeholder={`Chọn khoản công nợ ${settlementCurrency ?? ''} đang mở`}
            options={settlementOptions}
            notFoundContent={`Không có công nợ ${settlementCurrency ?? ''} đang mở`}
            onChange={(id) => {
              const debt = debts.find((item) => item.id === id);
              if (debt) openSettlement(debt);
            }}
          />
        </div>
        {settleTarget && (
          <>
            <Card size="small" className="mb-4">
              <Row gutter={[12, 8]}>
                <Col span={12}><Typography.Text type="secondary">Ngày công nợ</Typography.Text><div className="font-semibold">{toDateLabel(settleTarget.businessDate)}</div></Col>
                <Col span={12}><Typography.Text type="secondary">Đối tác</Typography.Text><div className="font-semibold">{settleTarget.providerCode}</div></Col>
                <Col span={12}><Typography.Text type="secondary">Chi nhánh</Typography.Text><div className="font-semibold">{branchById.get(settleTarget.branchId) ?? settleTarget.branchId}</div></Col>
                <Col span={12}><Typography.Text type="secondary">Còn lại</Typography.Text><div className="font-semibold text-red-600">{formatCurrency(settleTarget.outstanding, settleTarget.currencyCode)}</div></Col>
              </Row>
            </Card>
            <Form form={settleForm} layout="vertical" onFinish={submitSettlement}>
              {settleTarget.currencyCode === 'USD' ? (
                <>
                  <Alert
                    className="mb-4"
                    type={bankRate ? 'info' : 'warning'}
                    showIcon
                    message={bankRate
                      ? `Tỷ giá ngân hàng active: ${formatExchangeRate(bankRate.rate)} VND/USD`
                      : 'Chưa có tỷ giá ngân hàng USD/VND active'}
                    description="Phần nguyên nhận bằng USD tiền mặt; phần lẻ dưới 1 USD được quy đổi và nhận bằng VND."
                  />
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item name="cashUsdAmount" label="Phần nguyên USD" rules={[{ required: true, message: 'Nhập phần nguyên USD' }]}>
                        <InputNumber className="w-full" min={0} precision={0} controls={false} formatter={numberInputFormatter} parser={numberInputParser} addonAfter="USD" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="oddUsdAmount" label="Phần lẻ USD" rules={[{ required: true, message: 'Nhập phần lẻ USD' }]}>
                        <InputNumber className="w-full" min={0} max={0.99} precision={2} controls={false} formatter={numberInputFormatter} parser={numberInputParser} addonAfter="USD" />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="VND nhận cho phần lẻ">
                        <InputNumber className="w-full" value={Math.round(oddUsdAmount * (bankRate?.rate ?? 0))} readOnly controls={false} formatter={numberInputFormatter} parser={numberInputParser} addonAfter="VND" />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ) : (
                <>
                  <Alert className="mb-4" type="info" showIcon message="Tiền VND nhận về tài khoản ngân hàng được chọn và đồng thời giảm công nợ." />
                  <Form.Item name="bankAccountId" label="Tài khoản ngân hàng nhận" rules={[{ required: true, message: 'Chọn tài khoản ngân hàng' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Chọn tài khoản VND"
                      options={bankAccounts
                        .filter((account) => account.currencyCode === 'VND')
                        .map((account) => ({ value: account.id, label: `${account.bankCode} - ${account.accountNo} (${formatCurrency(account.currentBalance, 'VND')})` }))}
                    />
                  </Form.Item>
                  <Form.Item name="amount" label="Số tiền nhận" rules={[{ required: true, message: 'Nhập số tiền nhận' }]}>
                    <InputNumber className="w-full" min={1} max={settleTarget.outstanding} precision={0} controls={false} formatter={numberInputFormatter} parser={numberInputParser} addonAfter="VND" />
                  </Form.Item>
                  <Form.Item name="bankReference" label="Mã tham chiếu ngân hàng" rules={[{ required: true, message: 'Nhập mã tham chiếu' }]}>
                    <Input prefix={<BankOutlined />} maxLength={100} placeholder="Mã giao dịch trên sao kê" />
                  </Form.Item>
                </>
              )}
              <Form.Item name="description" label="Diễn giải" rules={[{ required: true, message: 'Nhập diễn giải xử lý' }]}>
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="Nguồn tiền nhận hoặc nội dung bù trừ" />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      <Modal
        title={`Lịch sử biến động - ${movementTarget?.name ?? ''}`}
        open={!!movementTarget}
        onCancel={() => setMovementTarget(null)}
        footer={null}
        width={760}
      >
        <Table
          rowKey="id"
          size="small"
          loading={isLoadingMovements}
          pagination={{ pageSize: 8 }}
          dataSource={movements}
          columns={[
            { title: 'Loại', dataIndex: 'movementType', render: (value) => <Tag color={value === 'SETTLEMENT' ? 'green' : 'gold'}>{value === 'SETTLEMENT' ? 'Xử lý' : 'Phát sinh'}</Tag> },
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (value, record: any) => formatCurrency(value, record.currencyCode) },
            { title: 'Ngày ghi nhận', dataIndex: 'businessDate', render: toDateLabel },
            { title: 'Diễn giải', dataIndex: 'description', ellipsis: true },
          ]}
        />
      </Modal>
    </PageScaffold>
  );
}
