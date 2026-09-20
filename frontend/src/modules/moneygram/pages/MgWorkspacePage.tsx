// Flow MG — Tạo giao dịch MoneyGram (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Slider, Typography } from 'antd';
import { EditOutlined, SendOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { preventNumberInputEnter } from '@/shared/utils/formEvents';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
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
import { useCreateMg, useMgTransactions } from '../hooks/useMg';
import type { ExchangeRateDto, ExchangeRateType, ServiceProvider } from '@/modules/exchange-rate/api/exchangeRate.api';
import { clampPaidRate, getPaidRateBounds, PAID_RATE_STEP } from '@/modules/transactions/utils/paidRateSlider';

import { TransactionCreatePage } from '@/modules/transactions/components/TransactionCreatePage';
import { useTransactionBranchScope } from '@/modules/transactions/hooks/useTransactionBranchScope';
import { positiveNumberRule } from '@/modules/transactions/utils/formRules';
import { transactionAdminApi } from '@/modules/transactions/api/transactionAdmin.api';

export function MgWorkspacePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const editTransactionId = searchParams.get('edit');
  const isEditMode = Boolean(editTransactionId);
  const { data: activeRates = [] } = useActiveRates();
  const create = useCreateMg();
  const [form] = Form.useForm();
  const previousPayoutAmount = useRef<number>();
  const previousPayoutCurrency = useRef<string>();
  const { user, isBranchUser, canCreateTransaction, branchOptions, resetBranchField } = useTransactionBranchScope(form);
  const { data: editTransactions = [], isLoading: isLoadingEditTransaction } = useMgTransactions(
    isBranchUser ? user?.branchId : undefined,
  );
  const editTransaction = editTransactions.find((transaction) => transaction.id === editTransactionId);
  const canSubmit = canCreateTransaction;
  const replace = useMutation({
    mutationFn: async ({ correctedData, reason }: { correctedData: Record<string, unknown>; reason: string }) => {
      if (!editTransactionId) throw new Error('Không tìm thấy giao dịch cần sửa');
      const request = {
        action: 'REPLACE' as const,
        reason,
        proposedCorrection: `Sửa giao dịch MG ${editTransaction?.transactionNo ?? editTransactionId}`,
        correctedData,
      };
      return user?.role === 'branch'
        ? transactionAdminApi.createAdjustmentRequest(editTransactionId, request)
        : transactionAdminApi.replaceDirectly(editTransactionId, request);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mg'] }),
        queryClient.invalidateQueries({ queryKey: ['fund'] }),
        queryClient.invalidateQueries({ queryKey: ['debts'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-adjustment-requests'] }),
      ]);
      void message.success(user?.role === 'branch'
        ? 'Đã gửi yêu cầu sửa giao dịch MG để GĐ/KTTH duyệt'
        : 'Đã đảo giao dịch cũ và tạo giao dịch MG đã sửa');
      navigate('/transactions');
    },
    onError: (error: unknown) => void message.error(getApiErrorMessage(error, 'Không thể sửa giao dịch MG')),
  });

  const resetTransactionForm = () => {
    form.resetFields();
    resetBranchField();
  };

  const paidCurrency = Form.useWatch('paidCurrency', form) ?? 'USD';
  const paidAmount = Number(Form.useWatch('paidAmount', form) ?? 0);
  const payoutCurrency = Form.useWatch('payoutCurrency', form) ?? 'VND';
  const payoutAmount = Number(Form.useWatch('payoutAmount', form) ?? 0);
  const receivedUsd = Number(Form.useWatch('receivedUsd', form) ?? 0);
  const receivedVnd = Number(Form.useWatch('receivedVnd', form) ?? 0);
  const transactionRate = Number(Form.useWatch('appliedRate', form) ?? 0);
  const rateType: ExchangeRateType = payoutCurrency === 'VND' ? 'PAID_BUY' : 'PAID_SELL';
  const systemRate = findActiveRate(activeRates, rateType, 'USD', 'WU_MG')?.rate;
  const fxRateType: ExchangeRateType = payoutCurrency === 'VND' ? 'FX_BUY' : 'FX_SELL';
  const fxUsdRate = findActiveRate(activeRates, fxRateType, 'USD', 'INTERNAL')?.rate;
  const rateBounds = getPaidRateBounds(systemRate, fxUsdRate);
  const sliderRate = clampPaidRate(transactionRate, systemRate, fxUsdRate);
  const canAdjustRate = Boolean(systemRate && fxUsdRate && rateBounds.min < rateBounds.max);
  const resetReceivedUsd = previousPayoutAmount.current !== payoutAmount
    || previousPayoutCurrency.current !== payoutCurrency;
  const splitPayout = splitMgPayout(
    payoutCurrency,
    payoutAmount,
    transactionRate,
    receivedUsd,
    resetReceivedUsd,
  );

  useEffect(() => {
    if (!isEditMode && systemRate) {
      form.setFieldsValue({
        appliedRate: clampPaidRate(systemRate, systemRate, fxUsdRate),
      });
    }
  }, [form, fxUsdRate, isEditMode, systemRate]);

  useEffect(() => {
    if (!isEditMode || !editTransaction) return;
    const editPaidAmount = editTransaction.paidCurrency === 'USD'
      ? editTransaction.mgUsdAmount
      : editTransaction.mgVndAmount;
    form.setFieldsValue({
      branchId: editTransaction.branchId,
      referenceNo: editTransaction.referenceNo,
      customerName: editTransaction.customerName ?? undefined,
      paidCurrency: editTransaction.paidCurrency,
      paidAmount: editPaidAmount,
      payoutCurrency: editTransaction.payoutCurrency as 'USD' | 'VND',
      payoutAmount: editTransaction.payoutAmount,
      receivedUsd: editTransaction.receivedUsd,
      receivedVnd: editTransaction.receivedVnd,
      appliedRate: editTransaction.appliedRate,
    });
    previousPayoutAmount.current = editTransaction.payoutAmount;
    previousPayoutCurrency.current = editTransaction.payoutCurrency;
  }, [editTransaction, form, isEditMode]);

  useEffect(() => {
    if (!transactionRate || paidAmount <= 0) {
      form.setFieldsValue({ payoutAmount: 0 });
      return;
    }

    form.setFieldsValue({
      payoutAmount: getSuggestedPayoutAmount(paidCurrency, paidAmount, payoutCurrency, transactionRate),
    });
  }, [form, paidAmount, paidCurrency, payoutCurrency, transactionRate]);

  useEffect(() => {
    form.setFieldsValue({
      receivedUsd: splitPayout.receivedUsd,
      receivedVnd: splitPayout.receivedVnd,
    });
    previousPayoutAmount.current = payoutAmount;
    previousPayoutCurrency.current = payoutCurrency;
  }, [form, payoutAmount, payoutCurrency, splitPayout.receivedUsd, splitPayout.receivedVnd]);

  const onCreate = async (v: MgFormValues) => {
    if (!canSubmit) {
      await message.error('Cần có quyền chi nhánh hoặc quyền GĐ/KTTH để tạo giao dịch MG');
      return;
    }

    try {
      const normalized = normalizeMgAmounts(v.paidCurrency, Number(v.paidAmount ?? 0));
      const payload = {
        branchId: isBranchUser && user?.branchId ? user.branchId : v.branchId,
        referenceNo: normalizeMgReference(v.referenceNo),
        customerName: v.customerName,
        mgUsdAmount: normalized.mgUsdAmount,
        mgVndAmount: normalized.mgVndAmount,
        payoutCurrency: v.payoutCurrency,
        payoutAmount: v.payoutAmount ?? 0,
        receivedUsd: v.receivedUsd ?? 0,
        receivedVnd: v.receivedVnd ?? 0,
        appliedRate: v.appliedRate,
        paidCurrency: v.paidCurrency,
      };
      if (isEditMode) {
        await replace.mutateAsync({ correctedData: payload, reason: v.reason });
        return;
      }
      await create.mutateAsync(payload);
      message.success('Đã tạo GD MG — quỹ giảm, công nợ MG tăng');
      resetTransactionForm();
      previousPayoutAmount.current = undefined;
      previousPayoutCurrency.current = undefined;
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Tạo GD thất bại'));
    }
  };

  return (
    <TransactionCreatePage
      title="Giao dịch MoneyGram"
      description={isEditMode ? 'Sửa giao dịch bằng cách đảo giao dịch cũ và tạo revision mới để giữ nguyên lịch sử sổ.' : 'Giống Western Union, khóa = Reference Number (mỗi Ref chỉ xử lý 1 lần).'}
      moduleName="moneygram"
    >
      <Row justify="center">
        <Col xs={24} xl={18}>
          <Card title={isEditMode ? `Sửa giao dịch MG ${editTransaction?.transactionNo ?? ''}` : 'Tạo giao dịch MG'} size="small" loading={isEditMode && isLoadingEditTransaction}>
            <Form form={form} layout="vertical" onFinish={onCreate}
              onKeyDownCapture={preventNumberInputEnter}
              disabled={!canSubmit || (isEditMode && !editTransaction)}
              initialValues={{
                branchId: isBranchUser ? user?.branchId : undefined,
                paidCurrency: 'USD',
                payoutCurrency: 'VND',
                paidAmount: 0,
                payoutAmount: 0,
                receivedUsd: 0,
                receivedVnd: 0,
                appliedRate: 0,
              }}>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh" disabled={isBranchUser || isEditMode} options={branchOptions} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item
                  name="referenceNo"
                  label="Reference Number"
                  rules={[{ required: true }, { pattern: /^[A-Z0-9]{8}$/, message: 'Đúng 8 ký tự chữ hoa hoặc số' }]}
                  getValueFromEvent={(event: ChangeEvent<HTMLInputElement>) => normalizeMgReference(event.target.value)}
                >
                  <Input maxLength={8} placeholder="AB12CD34" /></Form.Item></Col>
                <Col span={12}><Form.Item name="customerName" label="Tên khách"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={24}><Form.Item name="paidAmount" label="Số tiền MG" rules={[positiveNumberRule('Số tiền MG')]}>
                  <InputNumber
                    min={0}
                    keyboard={false}
                    precision={paidCurrency === 'USD' ? 2 : 0}
                    addonAfter={paidCurrency}
                    style={{ width: '100%' }}
                    formatter={paidCurrency === 'USD' ? usdInputFormatter : numberInputFormatter}
                    parser={paidCurrency === 'USD' ? usdInputParser : numberInputParser}
                  />
                </Form.Item></Col>
              </Row>
              <Form.Item name="payoutAmount" hidden><InputNumber /></Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="receivedVnd" label={payoutCurrency === 'USD' ? 'Trả khách VND phần lẻ' : 'Trả khách VND'}>
                  <InputNumber
                    min={0}
                    precision={0}
                    addonAfter="VND"
                    readOnly
                    controls={false}
                    style={{ width: '100%' }}
                    formatter={numberInputFormatter}
                    parser={numberInputParser}
                  />
                </Form.Item></Col>
                <Col span={12}><Form.Item name="receivedUsd" label="Trả khách USD (số nguyên)">
                    <InputNumber
                      min={0}
                      max={Math.trunc(Math.max(payoutAmount, 0))}
                      precision={0}
                      keyboard={false}
                      addonAfter="USD"
                      readOnly={payoutCurrency === 'VND'}
                      controls={payoutCurrency === 'USD'}
                      style={{ width: '100%' }}
                      formatter={usdInputFormatter}
                      parser={usdInputParser}
                    />
                </Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="payoutCurrency" label="Tiền khách nhận">
                  <Segmented className="wu-currency-segmented" block options={['USD', 'VND']} />
                </Form.Item></Col>
                <Col span={12}><Form.Item name="paidCurrency" label="Paid Currency (MG hoàn)">
                  <Segmented className="wu-currency-segmented" block options={['USD', 'VND']} />
                </Form.Item></Col>
              </Row>
              <Form.Item name="appliedRate" label="Tỷ giá giao dịch" rules={[positiveNumberRule('Tỷ giá giao dịch')]}>
                <InputNumber
                  min={rateBounds.min}
                  max={rateBounds.max}
                  precision={6}
                  step={PAID_RATE_STEP}
                  keyboard={false}
                  addonAfter="VND/USD"
                  style={{ width: '100%' }}
                  formatter={exchangeRateInputFormatter}
                  parser={exchangeRateInputParser}
                />
              </Form.Item>
              <Slider
                min={rateBounds.min}
                max={rateBounds.max}
                step={PAID_RATE_STEP}
                value={sliderRate}
                disabled={!systemRate || !canAdjustRate}
                tooltip={{ formatter: (value) => formatExchangeRate(Number(value ?? 0)) }}
                marks={{
                  [rateBounds.min]: formatExchangeRate(rateBounds.min),
                  [rateBounds.max]: formatExchangeRate(rateBounds.max),
                }}
                onChange={(value) => form.setFieldsValue({ appliedRate: value })}
              />

              <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50/50 p-4">
                <Typography.Text strong>Tóm tắt giao dịch</Typography.Text>
                <Row gutter={[12, 12]} className="mt-3">
                  <Col xs={24} md={8}>
                    <Typography.Text type="secondary">MG hoàn</Typography.Text>
                    <div className="text-lg font-semibold">{paidCurrency === 'USD' ? formatUsd(paidAmount) : formatVnd(paidAmount)}</div>
                    <Typography.Text type="secondary">{paidCurrency}</Typography.Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text type="secondary">Khách nhận</Typography.Text>
                    <div className="text-lg font-semibold">
                      {payoutCurrency === 'USD'
                        ? `${formatUsd(receivedUsd, 0)} + ${formatVnd(receivedVnd)}`
                        : formatVnd(receivedVnd)}
                    </div>
                    <Typography.Text type="secondary">
                      {payoutCurrency === 'USD'
                        ? `${formatUsd(splitPayout.convertedUsd)} còn lại được quy đổi sang VND`
                        : 'VND'}
                    </Typography.Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text type="secondary">Tỷ giá áp dụng</Typography.Text>
                    <div className="text-lg font-semibold">{formatExchangeRate(transactionRate)}</div>
                    <Typography.Text type="secondary">
                      {rateType === 'PAID_BUY' ? 'Paid mua' : 'Paid bán'} {formatExchangeRate(systemRate ?? 0)} ·{' '}
                      {fxRateType === 'FX_BUY' ? 'Mua USD' : 'Bán USD'} {formatExchangeRate(fxUsdRate ?? 0)}
                    </Typography.Text>
                  </Col>
                </Row>
              </div>

              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message="Chưa có tỷ giá hệ thống ACTIVE cho MG. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch." />
              )}

              {isEditMode && (
                <Form.Item name="reason" label="Lý do sửa giao dịch" rules={[{ required: true, whitespace: true, message: 'Nhập lý do sửa giao dịch' }]}>
                  <Input.TextArea rows={3} maxLength={500} showCount placeholder="Mô tả thông tin sai và nội dung đã sửa" />
                </Form.Item>
              )}

              <Button type="primary" htmlType="submit" icon={isEditMode ? <EditOutlined /> : <SendOutlined />} loading={create.isPending || replace.isPending} disabled={!canSubmit || !systemRate} block>
                {isEditMode ? (user?.role === 'branch' ? 'Gửi yêu cầu sửa giao dịch' : 'Lưu giao dịch đã sửa') : 'Tạo giao dịch'}
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </TransactionCreatePage>
  );
}

interface MgFormValues {
  branchId: string;
  referenceNo: string;
  customerName?: string;
  paidCurrency: 'USD' | 'VND';
  paidAmount: number;
  payoutCurrency: 'USD' | 'VND';
  payoutAmount?: number;
  receivedUsd?: number;
  receivedVnd?: number;
  appliedRate: number;
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

function normalizeMgReference(value?: string) {
  return String(value ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
}

function normalizeMgAmounts(paidCurrency: string, paidAmount: number) {
  if (paidCurrency === 'VND') {
    return { mgVndAmount: Math.round(paidAmount) };
  }
  return { mgUsdAmount: Number(paidAmount.toFixed(2)) };
}

function getSuggestedPayoutAmount(
  paidCurrency: string,
  paidAmount: number,
  payoutCurrency: string,
  appliedRate: number,
) {
  if (paidCurrency === payoutCurrency) return paidAmount;
  if (paidCurrency === 'USD' && payoutCurrency === 'VND') return Math.round(paidAmount * appliedRate);
  if (paidCurrency === 'VND' && payoutCurrency === 'USD') return Number((paidAmount / appliedRate).toFixed(2));
  return 0;
}

function splitMgPayout(
  payoutCurrency: string,
  payoutAmount: number,
  appliedRate: number,
  currentReceivedUsd: number,
  resetReceivedUsd: boolean,
) {
  if (payoutCurrency === 'VND') {
    return {
      receivedUsd: 0,
      receivedVnd: Math.round(Math.max(payoutAmount, 0)),
      convertedUsd: 0,
    };
  }

  const safePayout = Math.max(payoutAmount, 0);
  const maxReceivedUsd = Math.trunc(safePayout);
  const receivedUsd = resetReceivedUsd
    ? maxReceivedUsd
    : Math.min(Math.max(Math.trunc(currentReceivedUsd), 0), maxReceivedUsd);
  const convertedUsd = Math.max(safePayout - receivedUsd, 0);

  return {
    receivedUsd,
    receivedVnd: Math.round(convertedUsd * Math.max(appliedRate, 0)),
    convertedUsd,
  };
}
