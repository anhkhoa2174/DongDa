// Flow FX — Mua/Bán ngoại tệ (nối API thật)
import { App, Alert, Button, Card, Checkbox, Col, Form, Input, InputNumber, Row, Segmented, Select, Slider, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, SwapOutlined } from '@ant-design/icons';
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { preventNumberInputEnter } from '@/shared/utils/formEvents';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { currencyOptions, getCurrencyMetadata } from '@/shared/constants/currencies';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatCurrency,
  formatNumber,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { useCreateFx, useFxStock, useFxTransactions } from '../hooks/useFx';
import type { ExchangeRateDto, ExchangeRateType, ServiceProvider } from '@/modules/exchange-rate/api/exchangeRate.api';
import { TransactionCreatePage } from '@/modules/transactions/components/TransactionCreatePage';
import { useTransactionBranchScope } from '@/modules/transactions/hooks/useTransactionBranchScope';
import { positiveNumberRule } from '@/modules/transactions/utils/formRules';
import { transactionAdminApi } from '@/modules/transactions/api/transactionAdmin.api';

const FX_CURRENCY_OPTIONS = currencyOptions.filter((currency) => currency.value !== 'VND');
const money = (n: number) => formatNumber(n, 2);
type FxStockRow = {
  currency: string;
  total: number;
  hasBalance: boolean;
  balanceByBranch: Record<string, number>;
};
export function FxWorkspacePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const editTransactionId = searchParams.get('edit');
  const isEditMode = Boolean(editTransactionId);
  const { data: activeRates = [] } = useActiveRates();
  const create = useCreateFx();
  const [form] = Form.useForm();
  const { user, branches, isBranchUser, canCreateTransaction, branchOptions, resetBranchField } = useTransactionBranchScope(form, { includeHeadOffice: true });
  const { data: stock = [] } = useFxStock(isBranchUser ? user?.branchId : undefined);
  const { data: editTransactions = [], isLoading: isLoadingEditTransaction } = useFxTransactions(isBranchUser ? user?.branchId : undefined);
  const editTransaction = editTransactions.find((transaction) => transaction.id === editTransactionId);
  const replace = useMutation({
    mutationFn: async ({ correctedData, reason }: { correctedData: Record<string, unknown>; reason: string }) => {
      if (!editTransactionId) throw new Error('Không tìm thấy giao dịch cần sửa');
      const request = {
        action: 'REPLACE' as const,
        reason,
        proposedCorrection: `Sửa giao dịch ngoại tệ ${editTransaction?.transactionNo ?? editTransactionId}`,
        correctedData,
      };
      return user?.role === 'branch'
        ? transactionAdminApi.createAdjustmentRequest(editTransactionId, request)
        : transactionAdminApi.replaceDirectly(editTransactionId, request);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['fx-trading'] }),
        queryClient.invalidateQueries({ queryKey: ['fund'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-adjustment-requests'] }),
      ]);
      void message.success(user?.role === 'branch'
        ? 'Đã gửi yêu cầu sửa giao dịch ngoại tệ để GĐ/KTTH duyệt'
        : 'Đã đảo giao dịch cũ và tạo giao dịch ngoại tệ đã sửa');
      navigate('/transactions');
    },
    onError: (error: unknown) => void message.error(getApiErrorMessage(error, 'Không thể sửa giao dịch ngoại tệ')),
  });

  const resetTransactionForm = () => {
    form.resetFields();
    resetBranchField();
  };

  const amount = Form.useWatch('fxAmount', form) ?? 0;
  const hasFraction = Form.useWatch('hasFraction', form) ?? false;
  const fractionalAmount = Form.useWatch('fractionalAmount', form) ?? 0;
  const deductionVnd = Form.useWatch('deductionVnd', form) ?? 0;
  const rate = Form.useWatch('rate', form) ?? 0;
  const side = Form.useWatch('side', form) ?? 'buy';
  const fxCurrency = Form.useWatch('fxCurrency', form) ?? 'USD';
  const activeRate = findActiveRate(activeRates, side === 'buy' ? 'FX_BUY' : 'FX_SELL', fxCurrency, 'INTERNAL');
  const systemRate = activeRate?.rate;
  const margin = Number(activeRate?.margin ?? 0);
  const rateBounds = getFxRateBounds(Number(systemRate ?? 0), margin, side === 'buy');
  const sliderRate = clampFxRate(Number(rate), rateBounds);
  const effectiveFractionalAmount = side === 'buy' && hasFraction ? Number(fractionalAmount) : 0;
  const totalFxAmount = Number(amount) + effectiveFractionalAmount;
  const grossVndAmount = Math.round(totalFxAmount * Number(rate));
  const netVndAmount = Math.max(grossVndAmount - Math.round(Number(deductionVnd)), 0);

  useEffect(() => {
    if (!isEditMode && systemRate) {
      form.setFieldsValue({ rate: systemRate });
    }
  }, [form, isEditMode, systemRate]);

  useEffect(() => {
    if (!isEditMode || !editTransaction) return;
    const editFraction = Number(editTransaction.fractionalAmount ?? 0);
    form.setFieldsValue({
      branchId: editTransaction.branchId,
      side: editTransaction.isBuy ? 'buy' : 'sell',
      fxCurrency: editTransaction.fxCurrency,
      fxAmount: Math.max(Number(editTransaction.fxAmount) - editFraction, 0),
      hasFraction: editFraction > 0,
      fractionalAmount: editFraction,
      deductionVnd: editTransaction.deductionVnd,
      rate: editTransaction.rate,
      customerName: editTransaction.customerName ?? undefined,
    });
  }, [editTransaction, form, isEditMode]);

  useEffect(() => {
    if (side !== 'buy') {
      form.setFieldsValue({ hasFraction: false, fractionalAmount: 0, deductionVnd: 0 });
    }
  }, [form, side]);

  useEffect(() => {
    if (!hasFraction) form.setFieldValue('fractionalAmount', 0);
  }, [form, hasFraction]);

  const onCreate = async (v: FxFormValues) => {
    if (!canCreateTransaction) {
      await message.error('Cần có quyền chi nhánh hoặc quyền GĐ/KTTH để tạo giao dịch ngoại tệ');
      return;
    }

    try {
      const payload = {
        branchId: isBranchUser && user?.branchId ? user.branchId : v.branchId,
        isBuy: v.side === 'buy',
        fxCurrency: v.fxCurrency,
        fxAmount: v.fxAmount,
        fractionalAmount: v.side === 'buy' && v.hasFraction ? Number(v.fractionalAmount ?? 0) : 0,
        deductionVnd: v.side === 'buy' ? Number(v.deductionVnd ?? 0) : 0,
        rate: v.rate,
        customerName: v.customerName,
      };
      if (isEditMode) {
        await replace.mutateAsync({ correctedData: payload, reason: v.reason });
        return;
      }
      await create.mutateAsync(payload);
      message.success(v.side === 'buy' ? 'Đã mua ngoại tệ — tồn tăng, quỹ VND giảm' : 'Đã bán ngoại tệ — tồn giảm, quỹ VND tăng');
      resetTransactionForm();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Giao dịch thất bại'));
    }
  };

  const stockBranches = useMemo(() => {
    const branchIds = new Set(stock.map((item) => item.branchId));
    return branches
      .filter((branch) => branchIds.has(branch.id))
      .sort((first, second) => {
        if (first.type === 'HEAD_OFFICE' && second.type !== 'HEAD_OFFICE') return -1;
        if (first.type !== 'HEAD_OFFICE' && second.type === 'HEAD_OFFICE') return 1;
        return first.code.localeCompare(second.code);
      });
  }, [branches, stock]);

  const stockRows = useMemo<FxStockRow[]>(() => {
    const balances = new Map<string, number>();
    stock.forEach((item) => {
      const key = `${item.currency.toUpperCase()}:${item.branchId}`;
      balances.set(key, (balances.get(key) ?? 0) + Number(item.balance));
    });
    const currencies = new Set([
      'VND',
      'USD',
      ...stock.map((item) => item.currency.toUpperCase()),
    ]);

    return [...currencies]
      .map((currency) => {
        const balanceByBranch = Object.fromEntries(stockBranches.map((branch) => [
          branch.id,
          balances.get(`${currency}:${branch.id}`) ?? 0,
        ]));
        const branchBalances = Object.values(balanceByBranch);
        return {
          currency,
          balanceByBranch,
          total: branchBalances.reduce((sum, balance) => sum + balance, 0),
          hasBalance: branchBalances.some((balance) => balance !== 0),
        };
      })
      .sort((first, second) => Number(second.hasBalance) - Number(first.hasBalance)
        || (second.hasBalance ? second.total - first.total : first.currency.localeCompare(second.currency)));
  }, [stock, stockBranches]);
  const baseFundRows = stockRows.filter((row) => row.currency === 'VND' || row.currency === 'USD');
  const fundARows = stockRows.filter((row) => row.currency !== 'VND' && row.currency !== 'USD' && row.hasBalance);

  const stockCols: ColumnsType<FxStockRow> = [
    {
      title: 'Loại tiền',
      dataIndex: 'currency',
      fixed: 'left',
      width: 125,
      render: (currency: string, row) => (
        <div>
          <Typography.Text strong>{currency}</Typography.Text>
          <Typography.Text type="secondary" className="block text-xs!">{getCurrencyMetadata(currency).name}</Typography.Text>
          {row.hasBalance && <Typography.Text className="text-xs! text-brand-700!">Có tồn quỹ</Typography.Text>}
        </div>
      ),
    },
    ...stockBranches.map<ColumnsType<FxStockRow>[number]>((branch) => ({
      title: (
        <div>
          <Typography.Text strong>{branch.type === 'HEAD_OFFICE' ? 'Hội sở' : branch.code}</Typography.Text>
          <Typography.Text type="secondary" className="block max-w-32 truncate text-xs!" title={branch.name}>
            {branch.name}
          </Typography.Text>
        </div>
      ),
      key: branch.id,
      width: 145,
      align: 'right',
      render: (_, row) => {
        const balance = row.balanceByBranch[branch.id] ?? 0;
        return (
          <Typography.Text strong={balance !== 0} type={balance === 0 ? 'secondary' : undefined}>
            {money(balance)}
          </Typography.Text>
        );
      },
    })),
    {
      title: 'Tổng tồn',
      dataIndex: 'total',
      fixed: 'right',
      width: 145,
      align: 'right',
      render: (balance: number) => <Typography.Text strong>{money(balance)}</Typography.Text>,
    },
  ];

  return (
    <TransactionCreatePage
      title={isEditMode ? 'Sửa giao dịch ngoại tệ' : 'Mua / Bán ngoại tệ'}
      description={isEditMode ? 'Sửa giao dịch bằng cách đảo giao dịch cũ và tạo revision mới để giữ nguyên lịch sử sổ.' : 'Mua (khách bán cho công ty): quỹ VND giảm, tồn ngoại tệ tăng. Bán: ngược lại. Không bán vượt tồn.'}
      moduleName="foreign-exchange"
    >
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={10} xl={9}>
          <Card title={isEditMode ? `Sửa ${editTransaction?.transactionNo ?? ''}` : 'Giao dịch ngoại tệ'} size="small" className="h-full" loading={isEditMode && isLoadingEditTransaction}>
            <Form
              form={form}
              layout="vertical"
              onFinish={onCreate}
              onKeyDownCapture={preventNumberInputEnter}
              disabled={!canCreateTransaction || (isEditMode && !editTransaction)}
              initialValues={{ branchId: isBranchUser ? user?.branchId : undefined, side: 'buy', fxCurrency: 'USD', fxAmount: 0, hasFraction: false, fractionalAmount: 0, deductionVnd: 0, rate: 0 }}
            >
              <Form.Item name="side" label="Loại giao dịch">
                <Segmented block options={[{ label: 'MUA (khách bán)', value: 'buy' }, { label: 'BÁN (khách mua)', value: 'sell' }]} />
              </Form.Item>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh" disabled={isBranchUser || isEditMode} options={branchOptions} />
              </Form.Item>
              <Row gutter={8}>
                <Col xs={24} sm={12}><Form.Item name="fxCurrency" label="Ngoại tệ" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" options={FX_CURRENCY_OPTIONS} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item
                  name="fxAmount"
                  label={side === 'buy' ? 'Số lượng nguyên' : 'Số lượng'}
                  rules={side === 'buy' && hasFraction
                    ? [{ required: true, type: 'number', min: 0, message: 'Số lượng nguyên không được âm' }]
                    : [positiveNumberRule('Số lượng')]}
                >
                  <InputNumber min={0} precision={side === 'buy' ? 0 : 2} keyboard={false} addonAfter={fxCurrency} style={{ width: '100%' }} formatter={usdInputFormatter} parser={usdInputParser} /></Form.Item></Col>
              </Row>
              {side === 'buy' && (
                <div className="mb-4 border-y border-slate-200 py-3">
                  <Form.Item name="hasFraction" valuePropName="checked" className="mb-3!">
                    <Checkbox>Có phần lẻ</Checkbox>
                  </Form.Item>
                  <Row gutter={8}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="fractionalAmount"
                        label="Phần lẻ"
                        rules={hasFraction ? [
                          { required: true, message: 'Nhập phần lẻ' },
                          { type: 'number', min: 0.01, max: 0.99, message: 'Phần lẻ phải từ 0.01 đến 0.99' },
                        ] : undefined}
                      >
                        <InputNumber disabled={!hasFraction} min={0} max={0.99} precision={2} step={0.01} keyboard={false} addonAfter={fxCurrency} style={{ width: '100%' }} formatter={usdInputFormatter} parser={usdInputParser} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        name="deductionVnd"
                        label="Khấu trừ"
                        extra="Số tiền giảm theo thỏa thuận mua bán"
                        dependencies={['fxAmount', 'fractionalAmount', 'rate']}
                        rules={[
                          { required: true, message: 'Nhập khấu trừ, có thể bằng 0' },
                          {
                            validator: (_, value) => Number(value ?? 0) >= grossVndAmount && grossVndAmount > 0
                              ? Promise.reject(new Error('Khấu trừ phải nhỏ hơn thành tiền'))
                              : Promise.resolve(),
                          },
                        ]}
                      >
                        <InputNumber min={0} precision={0} keyboard={false} addonAfter="VND" controls={false} style={{ width: '100%' }} formatter={numberInputFormatter} parser={numberInputParser} />
                      </Form.Item>
                    </Col>
                  </Row>
                  {hasFraction && (
                    <Typography.Text type="secondary" className="text-xs!">
                      Tiền chẵn và tiền lẻ cùng áp dụng tỷ giá giao dịch đang chọn.
                    </Typography.Text>
                  )}
                </div>
              )}
              <Row gutter={8}>
                <Col xs={24} sm={12}><Form.Item name="rate" label={side === 'buy' ? 'Giá mua' : 'Giá bán'} rules={[positiveNumberRule(side === 'buy' ? 'Giá mua' : 'Giá bán')]}>
                  <InputNumber
                    min={rateBounds.min}
                    max={rateBounds.max}
                    precision={6}
                    step={0.01}
                    keyboard={false}
                    addonAfter="VND"
                    controls={false}
                    style={{ width: '100%' }}
                    formatter={exchangeRateInputFormatter}
                    parser={exchangeRateInputParser}
                  /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="customerName" label="Khách"><Input /></Form.Item></Col>
              </Row>
              <Slider
                min={rateBounds.min}
                max={rateBounds.max}
                step={0.01}
                value={sliderRate}
                disabled={!systemRate || margin <= 0}
                tooltip={{ formatter: (value) => formatNumber(Number(value ?? 0), 6) }}
                marks={{
                  [rateBounds.min]: formatNumber(rateBounds.min, 6),
                  [rateBounds.max]: formatNumber(rateBounds.max, 6),
                }}
                onChange={(value) => form.setFieldValue('rate', value)}
              />
              <div className="mb-4 border-y border-slate-200 bg-slate-50 px-4 py-3">
                <Typography.Text strong>Tóm tắt giao dịch</Typography.Text>
                <Row gutter={[16, 12]} className="mt-3">
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">Loại tiền</Typography.Text>
                    <div className="mt-1 text-base font-semibold text-slate-900">{fxCurrency}</div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">Số lượng</Typography.Text>
                    <div className="mt-1 text-base font-semibold text-slate-900">{formatCurrency(totalFxAmount, fxCurrency)}</div>
                    {side === 'buy' && hasFraction && <Typography.Text type="secondary">Gồm {formatCurrency(effectiveFractionalAmount, fxCurrency)} lẻ</Typography.Text>}
                  </Col>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">Thành tiền</Typography.Text>
                    <div className="mt-1 text-lg font-semibold text-brand-700">{formatVnd(netVndAmount)}</div>
                    {side === 'buy' && Number(deductionVnd) > 0
                      ? <Typography.Text type="secondary">Gộp {formatVnd(grossVndAmount)} − {formatVnd(Number(deductionVnd))}</Typography.Text>
                      : <Typography.Text type="secondary">Biên độ {formatNumber(margin, 6)} VND</Typography.Text>}
                  </Col>
                </Row>
              </div>
              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message={`Chưa có tỷ giá ${side === 'buy' ? 'mua' : 'bán'} ACTIVE cho ${fxCurrency}. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch.`} />
              )}
              {isEditMode && (
                <Form.Item name="reason" label="Lý do sửa giao dịch" rules={[{ required: true, whitespace: true, message: 'Nhập lý do sửa giao dịch' }]}>
                  <Input.TextArea rows={3} maxLength={500} showCount placeholder="Mô tả thông tin sai và nội dung đã sửa" />
                </Form.Item>
              )}
              <Button type="primary" htmlType="submit" icon={isEditMode ? <EditOutlined /> : <SwapOutlined />} loading={create.isPending || replace.isPending} disabled={!canCreateTransaction || !systemRate} block>
                {isEditMode ? (user?.role === 'branch' ? 'Gửi yêu cầu sửa giao dịch' : 'Lưu giao dịch đã sửa') : side === 'buy' ? 'Mua ngoại tệ' : 'Bán ngoại tệ'}
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={14} xl={15}>
          <Card
            title="Tồn quỹ theo chi nhánh"
            size="small"
            className="h-full"
            extra={<Typography.Text type="secondary" className="text-xs!">Tự cập nhật mỗi 10 giây</Typography.Text>}
          >
            <Space direction="vertical" size={18} className="w-full">
              <section className="w-full">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Typography.Text strong>Quỹ gốc</Typography.Text>
                  <Tag color="gold">VND · USD</Tag>
                </div>
                <Table<FxStockRow>
                  rowKey="currency"
                  size="small"
                  columns={stockCols}
                  dataSource={baseFundRows}
                  pagination={false}
                  scroll={{ x: Math.max(560, 270 + stockBranches.length * 145) }}
                  rowClassName={(row) => row.hasBalance ? 'fx-stock-row--active' : 'fx-stock-row--empty'}
                />
              </section>
              <section className="w-full border-t border-slate-200 pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Typography.Text strong>Quỹ A</Typography.Text>
                  <Tag>{fundARows.length} ngoại tệ có tồn</Tag>
                </div>
                <Table<FxStockRow>
                  rowKey="currency"
                  size="small"
                  columns={stockCols}
                  dataSource={fundARows}
                  pagination={false}
                  scroll={{ x: Math.max(560, 270 + stockBranches.length * 145) }}
                  locale={{ emptyText: 'Chưa có ngoại tệ tồn Quỹ A' }}
                  rowClassName={() => 'fx-stock-row--active'}
                />
              </section>
            </Space>
          </Card>
        </Col>
      </Row>
    </TransactionCreatePage>
  );
}

interface FxFormValues {
  branchId: string;
  side: 'buy' | 'sell';
  fxCurrency: string;
  fxAmount: number;
  hasFraction: boolean;
  fractionalAmount?: number;
  deductionVnd?: number;
  rate: number;
  customerName?: string;
  reason: string;
}

function findActiveRate(
  rates: ExchangeRateDto[],
  rateType: ExchangeRateType,
  fromCurrency: string,
  provider?: ServiceProvider,
) {
  return rates.find((rate) =>
    rate.rateType === rateType &&
    rate.fromCurrency === fromCurrency &&
    rate.toCurrency === 'VND' &&
    (!provider || rate.provider === provider),
  );
}

function getFxRateBounds(systemRate: number, margin: number, isBuy: boolean) {
  const safeRate = Number.isFinite(systemRate) && systemRate > 0 ? systemRate : 0;
  const safeMargin = Number.isFinite(margin) && margin > 0 ? margin : 0;
  return isBuy
    ? { min: Math.max(safeRate - safeMargin, 0.000001), max: safeRate }
    : { min: safeRate, max: safeRate + safeMargin };
}

function clampFxRate(value: number, bounds: { min: number; max: number }) {
  if (!Number.isFinite(value) || value <= 0) return bounds.min;
  return Math.min(Math.max(value, bounds.min), bounds.max);
}
