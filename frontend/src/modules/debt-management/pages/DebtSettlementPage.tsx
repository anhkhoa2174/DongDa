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
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BankOutlined, DollarOutlined, EyeOutlined, PayCircleOutlined, ReloadOutlined, SearchOutlined, WalletOutlined,
} from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { hasPermission } from '@/modules/auth/model/permissions';
import {
  formatCurrency, formatExchangeRate, numberInputFormatter, numberInputParser,
  usdInputFormatter, usdInputParser,
} from '@/shared/utils/formatters';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
import { useBankAccounts } from '@/modules/bank-management/hooks/useBank';
import { useBranches } from '@/shared/hooks/useBranches';
import {
  useDebtMovements, useDebts, useSettleDebtBatch,
} from '../hooks/useDebts';
import type { DebtAccountSummaryDto, DebtMovementDto, DebtStatus, ListDebtsParams } from '../api/debt.api';

const { RangePicker } = DatePicker;

const STATUS: Record<DebtStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: 'Chưa xử lý' },
  PARTIALLY_SETTLED: { color: 'blue', label: 'Đã xử lý một phần' },
  SETTLED: { color: 'green', label: 'Hoàn tất' },
};

const toDateLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN', { timeZone: 'UTC' });

function getApiErrorMessage(error: unknown) {
  const response = (error as { response?: { data?: { message?: unknown } } })?.response;
  return typeof response?.data?.message === 'string' ? response.data.message : null;
}

interface SettlementForm {
  settlementSource?: 'CASH' | 'BANK';
  amount?: number;
  cashUsdAmount?: number;
  oddUsdAmount?: number;
  bankAccountId?: string;
  bankReference?: string;
  description?: string;
}

interface DebtSettlementGroup {
  key: string;
  businessDate: string;
  providerCode: string;
  currencyCode: 'USD' | 'VND';
  accounts: DebtAccountSummaryDto[];
  totalOutstanding: number;
}

const DEFAULT_SETTLEMENT_DESCRIPTION = 'Đã nhận thanh khoản từ Ngân hàng';

export function DebtSettlementPage() {
  const { message } = App.useApp();
  const role = useAuthStore((state) => state.user?.role);
  const canSettle = hasPermission(role, 'debt.settle');
  const [query, setQuery] = useState<ListDebtsParams>({});
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<DebtStatus | 'ALL'>('ALL');
  const [settlementCurrency, setSettlementCurrency] = useState<'USD' | 'VND' | null>(null);
  const [settleGroup, setSettleGroup] = useState<DebtSettlementGroup | null>(null);
  const [movementTarget, setMovementTarget] = useState<DebtAccountSummaryDto | null>(null);
  const [settleForm] = Form.useForm<SettlementForm>();
  const [filterForm] = Form.useForm();

  const hasQuery = Object.values(query).some((value) => value !== undefined && value !== '');
  const { data: debts = [], isLoading } = useDebts(hasQuery ? query : undefined);
  const { data: allDebts = [] } = useDebts();
  const { data: branches = [] } = useBranches();
  const { data: movements = [], isLoading: isLoadingMovements } = useDebtMovements(movementTarget?.id ?? null);
  const settleBatch = useSettleDebtBatch();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: activeRates = [] } = useActiveRates();
  const settlementSource = Form.useWatch('settlementSource', settleForm) ?? 'CASH';
  const bankRate = activeRates.find((rate) => (
    rate.rateType === 'BANK_RATE' && rate.fromCurrency === 'USD' && rate.toCurrency === 'VND'
  ));
  const matchingBankAccounts = bankAccounts.filter((account) => (
    account.currencyCode === settlementCurrency
  ));

  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const visibleDebts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase('vi');
    return debts.filter((debt) => {
      const matchesStatus = status === 'ALL' || debt.status === status;
      const searchableText = [
        debt.providerCode,
        debt.currencyCode,
        debt.name,
        branchById.get(debt.branchId),
      ].filter(Boolean).join(' ').toLocaleLowerCase('vi');
      return matchesStatus && (!normalizedKeyword || searchableText.includes(normalizedKeyword));
    });
  }, [branchById, debts, keyword, status]);
  const settlementGroups = useMemo<DebtSettlementGroup[]>(() => {
    const groups = new Map<string, DebtSettlementGroup>();
    allDebts.filter((debt) => debt.outstanding > 0 && (debt.currencyCode === 'USD' || debt.currencyCode === 'VND'))
      .forEach((debt) => {
        const businessDate = debt.businessDate.slice(0, 10);
        const key = `${businessDate}:${debt.providerCode}:${debt.currencyCode}`;
        const current = groups.get(key) ?? {
          key,
          businessDate: debt.businessDate,
          providerCode: debt.providerCode,
          currencyCode: debt.currencyCode as 'USD' | 'VND',
          accounts: [],
          totalOutstanding: 0,
        };
        current.accounts.push(debt);
        current.totalOutstanding = Number((current.totalOutstanding + debt.outstanding).toFixed(2));
        groups.set(key, current);
      });
    return [...groups.values()].sort((left, right) => right.businessDate.localeCompare(left.businessDate)
      || left.providerCode.localeCompare(right.providerCode)
      || left.currencyCode.localeCompare(right.currencyCode));
  }, [allDebts]);
  const totals = useMemo(() => ({
    open: allDebts.filter((debt) => debt.outstanding > 0).length,
    partial: allDebts.filter((debt) => debt.status === 'PARTIALLY_SETTLED').length,
    settled: allDebts.filter((debt) => debt.status === 'SETTLED').length,
    outstandingVnd: allDebts
      .filter((debt) => debt.currencyCode === 'VND')
      .reduce((sum, debt) => sum + debt.outstanding, 0),
    outstandingUsd: allDebts
      .filter((debt) => debt.currencyCode === 'USD')
      .reduce((sum, debt) => sum + debt.outstanding, 0),
  }), [allDebts]);

  const resetFilters = () => {
    filterForm.resetFields();
    setQuery({});
    setKeyword('');
    setStatus('ALL');
  };

  const openSettlement = (group: DebtSettlementGroup) => {
    setSettlementCurrency(group.currencyCode);
    setSettleGroup(group);
    settleForm.resetFields();
    settleForm.setFieldsValue({
      settlementSource: 'BANK',
      amount: group.totalOutstanding,
      description: DEFAULT_SETTLEMENT_DESCRIPTION,
    });
  };

  const openSettlementPicker = (currency: 'USD' | 'VND') => {
    settleForm.resetFields();
    settleForm.setFieldsValue({ settlementSource: 'BANK', description: DEFAULT_SETTLEMENT_DESCRIPTION });
    setSettleGroup(null);
    setSettlementCurrency(currency);
  };

  const closeSettlement = () => {
    settleForm.resetFields();
    setSettleGroup(null);
    setSettlementCurrency(null);
  };

  const settlementOptions = settlementGroups
    .filter((group) => group.currencyCode === settlementCurrency)
    .map((group) => ({
      value: group.key,
      label: `${toDateLabel(group.businessDate)} - ${group.providerCode} - ${group.accounts.length} chi nhánh - ${formatCurrency(group.totalOutstanding, group.currencyCode)}`,
    }));

  const submitSettlement = async (values: SettlementForm) => {
    if (!settleGroup) return;
    try {
      await settleBatch.mutateAsync({
        debtAccountIds: settleGroup.accounts.map((account) => account.id),
        amount: settleGroup.totalOutstanding,
        settlementSource: values.settlementSource ?? 'BANK',
        bankAccountId: values.bankAccountId,
        bankReference: values.bankReference,
        description: values.description?.trim() || DEFAULT_SETTLEMENT_DESCRIPTION,
      });
      message.success(`Đã tất toán tổng ${settleGroup.accounts.length} khoản công nợ chi nhánh`);
      closeSettlement();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error) ?? 'Không thể xử lý công nợ');
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
            <Button
              type="primary"
              size="small"
              icon={<PayCircleOutlined />}
              onClick={() => {
                const key = `${record.businessDate.slice(0, 10)}:${record.providerCode}:${record.currencyCode}`;
                const group = settlementGroups.find((item) => item.key === key);
                if (group) openSettlement(group);
              }}
            >
              Xử lý tổng
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageScaffold
      title="Công Nợ"
      description="Theo dõi và giải quyết công nợ WU/MG theo ngày, chi nhánh và loại tiền trên một màn hình."
      moduleName="debt-management"
    >
      <Space direction="vertical" size={16} className="w-full">
        <OperationalOverviewCard
          eyebrow="Tổng quan hiện tại"
          title="Công nợ WU/MG toàn hệ thống"
          icon={<PayCircleOutlined />}
          aside={canSettle ? (
            <Space wrap size={8}>
              <Button className="shift-hero__open-button" icon={<DollarOutlined />} onClick={() => openSettlementPicker('USD')}>Xử lý USD</Button>
              <Button className="shift-hero__open-button" icon={<WalletOutlined />} onClick={() => openSettlementPicker('VND')}>Xử lý VND</Button>
            </Space>
          ) : undefined}
          metrics={[
            { label: 'Còn nợ VND', value: formatCurrency(totals.outstandingVnd, 'VND') },
            { label: 'Còn nợ USD', value: formatCurrency(totals.outstandingUsd, 'USD') },
            { label: 'Đang xử lý', value: `${totals.open} khoản`, note: `${totals.partial} khoản đã xử lý một phần` },
            { label: 'Hoàn tất', value: `${totals.settled} khoản` },
          ]}
        />

        <Card
          title={<div><Typography.Text strong>Tổng hợp để đối chiếu và xử lý</Typography.Text><div className="text-xs font-normal text-slate-500">Một dòng cho mỗi ngày, đối tác và loại tiền trên toàn hệ thống</div></div>}
          extra={<Tag color="gold">{settlementGroups.length} nhóm đang mở</Tag>}
          classNames={{ body: 'pt-3!' }}
        >
          <Table<DebtSettlementGroup>
            rowKey="key"
            size="small"
            pagination={{ pageSize: 8, showSizeChanger: false }}
            dataSource={settlementGroups}
            columns={[
              { title: 'Ngày', dataIndex: 'businessDate', width: 120, render: toDateLabel },
              { title: 'Đối tác', dataIndex: 'providerCode', width: 90, render: (value) => <Tag color={value === 'WU' ? 'blue' : 'cyan'}>{value}</Tag> },
              { title: 'Loại tiền', dataIndex: 'currencyCode', width: 90, align: 'center' },
              { title: 'Chi nhánh', dataIndex: 'accounts', width: 110, align: 'right', render: (accounts) => `${accounts.length} CN` },
              { title: 'Tổng còn nợ', dataIndex: 'totalOutstanding', align: 'right', render: (value, group) => <Typography.Text strong type="danger">{formatCurrency(value, group.currencyCode)}</Typography.Text> },
              ...(canSettle ? [{
                title: 'Thao tác', key: 'action', width: 150, align: 'right' as const,
                render: (_: unknown, group: DebtSettlementGroup) => <Button type="primary" icon={<PayCircleOutlined />} onClick={() => openSettlement(group)}>Xử lý toàn bộ</Button>,
              }] : []),
            ]}
          />
        </Card>

        <Card
          title={<div><Typography.Text strong>Danh sách công nợ</Typography.Text><div className="text-xs font-normal text-slate-500">Một khoản cho mỗi ngày, chi nhánh, đối tác và loại tiền</div></div>}
          extra={<Tag>{visibleDebts.length} / {debts.length} khoản</Tag>}
          classNames={{ body: 'pt-4!' }}
        >
          <Form form={filterForm} initialValues={{ status: 'ALL' }} className="mb-4">
            <Row gutter={[10, 10]}>
              <Col xs={24} md={12} xl={5}>
                <Form.Item name="keyword" noStyle>
                  <Input allowClear prefix={<SearchOutlined className="text-slate-400" />} placeholder="Tìm đối tác, chi nhánh..." onChange={(event) => setKeyword(event.target.value)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12} xl={5}>
                <Form.Item name="dateRange" noStyle>
                  <RangePicker className="w-full" format="DD/MM/YYYY" placeholder={['Từ ngày', 'Đến ngày']} onChange={(dates) => setQuery((current) => ({ ...current, dateFrom: dates?.[0]?.format('YYYY-MM-DD'), dateTo: dates?.[1]?.format('YYYY-MM-DD') }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8} xl={3}>
                <Form.Item name="branchId" noStyle>
                  <Select className="w-full" allowClear placeholder="Tất cả chi nhánh" options={branches.map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` }))} onChange={(branchId) => setQuery((current) => ({ ...current, branchId }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8} xl={2}>
                <Form.Item name="providerCode" noStyle>
                  <Select className="w-full" allowClear placeholder="Đối tác" options={['WU', 'MG'].map((value) => ({ value, label: value }))} onChange={(providerCode) => setQuery((current) => ({ ...current, providerCode }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8} xl={2}>
                <Form.Item name="currencyCode" noStyle>
                  <Select className="w-full" allowClear placeholder="Tiền tệ" options={['USD', 'VND'].map((value) => ({ value, label: value }))} onChange={(currencyCode) => setQuery((current) => ({ ...current, currencyCode }))} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8} xl={3}>
                <Form.Item name="status" noStyle>
                  <Select className="w-full" placeholder="Trạng thái" options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, ...Object.entries(STATUS).map(([value, meta]) => ({ value, label: meta.label }))]} onChange={(value) => setStatus(value ?? 'ALL')} />
                </Form.Item>
              </Col>
              <Col xs={12} xl={4}>
                <Button className="w-full" icon={<ReloadOutlined />} onClick={resetFilters}>Xóa bộ lọc</Button>
              </Col>
            </Row>
          </Form>

          <Table<DebtAccountSummaryDto>
            rowKey="id"
            loading={isLoading}
            columns={columns}
            dataSource={visibleDebts}
            scroll={{ x: 1400 }}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} khoản công nợ` }}
          />
        </Card>
      </Space>

      <Modal
        title={`Giải quyết công nợ ${settlementCurrency ?? ''}`}
        open={!!settlementCurrency}
        onCancel={closeSettlement}
        onOk={() => settleForm.submit()}
        confirmLoading={settleBatch.isPending}
        okText="Xác nhận xử lý"
        okButtonProps={{
          disabled: !settleGroup
            || (settlementSource === 'CASH' && settlementCurrency === 'USD' && !bankRate)
            || (settlementSource === 'BANK' && matchingBankAccounts.length === 0),
        }}
        destroyOnHidden
      >
        <div className="mb-4">
          <Typography.Text strong>Khoản công nợ theo ngày</Typography.Text>
          <Select
            className="mt-2 w-full"
            showSearch
            optionFilterProp="label"
            value={settleGroup?.key}
            placeholder={`Chọn tổng công nợ ${settlementCurrency ?? ''} theo ngày`}
            options={settlementOptions}
            notFoundContent={`Không có công nợ ${settlementCurrency ?? ''} đang mở`}
            onChange={(id) => {
              const group = settlementGroups.find((item) => item.key === id);
              if (group) openSettlement(group);
            }}
          />
        </div>
        {settleGroup && (
          <>
            <Card size="small" className="mb-4">
              <Row gutter={[12, 8]}>
                <Col span={12}><Typography.Text type="secondary">Ngày công nợ</Typography.Text><div className="font-semibold">{toDateLabel(settleGroup.businessDate)}</div></Col>
                <Col span={12}><Typography.Text type="secondary">Đối tác</Typography.Text><div className="font-semibold">{settleGroup.providerCode}</div></Col>
                <Col span={12}><Typography.Text type="secondary">Phạm vi</Typography.Text><div className="font-semibold">{settleGroup.accounts.length} chi nhánh</div></Col>
                <Col span={12}><Typography.Text type="secondary">Tổng chính xác</Typography.Text><div className="font-semibold text-red-600">{formatCurrency(settleGroup.totalOutstanding, settleGroup.currencyCode)}</div></Col>
              </Row>
            </Card>
            <Form form={settleForm} layout="vertical" onFinish={submitSettlement}>
              <Form.Item name="settlementSource" label="Nguồn tiền nhận" rules={[{ required: true }]}>
                <Segmented
                  block
                  options={[
                    { value: 'CASH', label: 'Tiền mặt (Quỹ)', icon: <WalletOutlined /> },
                    { value: 'BANK', label: 'Ngân hàng', icon: <BankOutlined /> },
                  ]}
                />
              </Form.Item>

              {settlementSource === 'BANK' ? (
                <>
                  <Alert
                    className="mb-4"
                    type={matchingBankAccounts.length > 0 ? 'info' : 'warning'}
                    showIcon
                    message={matchingBankAccounts.length > 0
                      ? `Tiền ${settleGroup.currencyCode} nhận vào một lần và phân bổ tất toán ${settleGroup.accounts.length} chi nhánh.`
                      : `Chưa có tài khoản ngân hàng ${settleGroup.currencyCode} đang hoạt động. Có thể chuyển sang nguồn Tiền mặt (Quỹ).`}
                  />
                  <Form.Item name="bankAccountId" label="Tài khoản ngân hàng nhận" rules={[{ required: true, message: 'Chọn tài khoản ngân hàng' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder={`Chọn tài khoản ${settleGroup.currencyCode}`}
                      options={matchingBankAccounts.map((account) => ({
                        value: account.id,
                        label: `${account.bankCode} - ${account.accountNo} (${formatCurrency(account.currentBalance, account.currencyCode)})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="amount" label="Tổng tiền nhận đã đối chiếu">
                    <InputNumber
                      className="w-full"
                      value={settleGroup.totalOutstanding}
                      precision={settleGroup.currencyCode === 'VND' ? 0 : 2}
                      controls={false}
                      readOnly
                      formatter={numberInputFormatter}
                      parser={numberInputParser}
                      addonAfter={settleGroup.currencyCode}
                    />
                  </Form.Item>
                  <Form.Item name="bankReference" label="Mã tham chiếu ngân hàng (không bắt buộc)">
                    <Input prefix={<BankOutlined />} maxLength={100} placeholder="Nhập khi có mã trên sao kê" />
                  </Form.Item>
                </>
              ) : settleGroup.currencyCode === 'USD' ? (
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
                    <Col span={12}><Form.Item label="Phần nguyên USD"><InputNumber className="w-full" value={Math.trunc(settleGroup.totalOutstanding)} precision={0} readOnly controls={false} formatter={usdInputFormatter} parser={usdInputParser} addonAfter="USD" /></Form.Item></Col>
                    <Col span={12}><Form.Item label="Phần lẻ USD"><InputNumber className="w-full" value={Number((settleGroup.totalOutstanding - Math.trunc(settleGroup.totalOutstanding)).toFixed(2))} precision={2} readOnly controls={false} formatter={usdInputFormatter} parser={usdInputParser} addonAfter="USD" /></Form.Item></Col>
                    <Col span={24}><Form.Item label="VND nhận cho phần lẻ"><InputNumber className="w-full" value={Math.round(Number((settleGroup.totalOutstanding - Math.trunc(settleGroup.totalOutstanding)).toFixed(2)) * (bankRate?.rate ?? 0))} readOnly controls={false} formatter={numberInputFormatter} parser={numberInputParser} addonAfter="VND" /></Form.Item></Col>
                  </Row>
                </>
              ) : (
                <>
                  <Alert
                    className="mb-4"
                    type="info"
                    showIcon
                    message="Tiền VND được ghi tăng vào quỹ tiền mặt Hội sở và đồng thời giảm công nợ."
                  />
                  <Form.Item name="amount" label="Tổng tiền nhận đã đối chiếu">
                    <InputNumber className="w-full" value={settleGroup.totalOutstanding} precision={0} readOnly controls={false} formatter={numberInputFormatter} parser={numberInputParser} addonAfter="VND" />
                  </Form.Item>
                </>
              )}
              <Form.Item name="description" label="Diễn giải" rules={[{ required: true, message: 'Nhập diễn giải xử lý' }]}>
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="Chỉ sửa khi có diễn giải khác" />
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
            { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (value: number, record: DebtMovementDto) => formatCurrency(value, record.currencyCode) },
            { title: 'Ngày ghi nhận', dataIndex: 'businessDate', render: toDateLabel },
            { title: 'Diễn giải', dataIndex: 'description', ellipsis: true },
          ]}
        />
      </Modal>
    </PageScaffold>
  );
}
