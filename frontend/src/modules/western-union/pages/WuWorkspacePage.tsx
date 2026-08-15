// Flow WU — Tạo giao dịch Western Union (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Slider, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { preventNumberInputEnter } from '@/shared/utils/formEvents';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatExchangeRate,
  formatUsd,
  formatVnd,
  formatWuMtcn,
  normalizeDigits,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { useCreateWu } from '../hooks/useWu';
import type { ExchangeRateDto, ExchangeRateType, ServiceProvider } from '@/modules/exchange-rate/api/exchangeRate.api';
import { clampPaidRate, getPaidRateBounds, PAID_RATE_STEP } from '@/modules/transactions/utils/paidRateSlider';
import { TransactionCreatePage } from '@/modules/transactions/components/TransactionCreatePage';
import { useTransactionBranchScope } from '@/modules/transactions/hooks/useTransactionBranchScope';
import { positiveNumberRule } from '@/modules/transactions/utils/formRules';

export function WuWorkspacePage() {
  const { message } = App.useApp();
  const { data: activeRates = [] } = useActiveRates();
  const create = useCreateWu();
  const [form] = Form.useForm();
  const previousPayoutCurrency = useRef<string | undefined>(undefined);
  const previousRateSelectionKey = useRef<string | undefined>(undefined);
  const previousWuUsd = useRef<number | undefined>(undefined);
  const { user, isBranchUser, canCreateTransaction, branchOptions, resetBranchField } = useTransactionBranchScope(form);

  const resetTransactionForm = () => {
    form.resetFields();
    resetBranchField();
  };

  // Theo dõi để tính WU implied rate, tỷ giá giao dịch và số tiền khách nhận.
  const wuUsd = Form.useWatch('wuUsdAmount', form) ?? 0;
  const wuVnd = Form.useWatch('wuVndAmount', form) ?? 0;
  const transactionRate = Form.useWatch('appliedRate', form) ?? 0;
  const payoutCurrency = Form.useWatch('payoutCurrency', form) ?? 'USD';
  const rateType: ExchangeRateType = payoutCurrency === 'VND' ? 'PAID_BUY' : 'PAID_SELL';
  const systemRate = findActiveRate(activeRates, rateType, 'USD', 'WU_MG')?.rate;
  const rateSelectionKey = `${rateType}:${systemRate ?? 0}`;
  const implied = wuUsd > 0 ? wuVnd / wuUsd : 0;
  const rateBounds = getPaidRateBounds(implied, systemRate);
  const receivedUsd = Number(Form.useWatch('receivedUsd', form) ?? 0);
  const receivedVnd = Number(Form.useWatch('receivedVnd', form) ?? 0);
  const payoutEquivalent = payoutCurrency === 'USD'
    ? receivedUsd * transactionRate + receivedVnd
    : receivedVnd;

  useEffect(() => {
    if (systemRate) {
      form.setFieldsValue({ appliedRate: systemRate });
    }
  }, [form, systemRate]);

  useEffect(() => {
    if (!wuUsd || !wuVnd || !transactionRate) return;

    const rateSelectionChanged = previousRateSelectionKey.current !== rateSelectionKey;
    const nextRate = clampPaidRate(
      rateSelectionChanged && systemRate ? systemRate : transactionRate,
      implied,
      systemRate,
    );
    const payoutCurrencyChanged = previousPayoutCurrency.current !== payoutCurrency;
    const wuUsdChanged = previousWuUsd.current !== wuUsd;
    const nextPayout = getWuPayout(
      payoutCurrency,
      wuUsd,
      nextRate,
      receivedUsd,
      payoutCurrencyChanged || wuUsdChanged,
    );
    form.setFieldsValue({
      appliedRate: nextRate,
      ...nextPayout,
    });
    previousPayoutCurrency.current = payoutCurrency;
    previousRateSelectionKey.current = rateSelectionKey;
    previousWuUsd.current = wuUsd;
  }, [form, implied, payoutCurrency, rateSelectionKey, receivedUsd, systemRate, transactionRate, wuUsd, wuVnd]);

  const onCreate = async (v: WuFormValues) => {
    if (!canCreateTransaction) {
      await message.error('Cần có quyền chi nhánh hoặc quyền GĐ/KTTH để tạo giao dịch WU');
      return;
    }

    try {
      await create.mutateAsync({
        branchId: isBranchUser && user?.branchId ? user.branchId : v.branchId,
        mtcn: v.mtcn,
        customerName: v.customerName,
        wuUsdAmount: v.wuUsdAmount,
        wuVndAmount: v.wuVndAmount,
        receivedUsd: v.receivedUsd ?? 0,
        receivedVnd: v.receivedVnd ?? 0,
        appliedRate: v.appliedRate,
        payoutCurrency: v.payoutCurrency,
        paidCurrency: v.paidCurrency,
      });
      message.success('Đã tạo GD WU — quỹ giảm, công nợ WU tăng');
      resetTransactionForm();
      previousPayoutCurrency.current = undefined;
      previousRateSelectionKey.current = undefined;
      previousWuUsd.current = undefined;
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Tạo GD thất bại'));
    }
  };

  return (
    <TransactionCreatePage
      title="Giao dịch Western Union"
      description="Tạo GD chi trả WU: nhập MSKH, số tiền WU, chọn tiền khách nhận và xác nhận lưu vào hệ thống."
      moduleName="western-union"
    >
      <Row justify="center">
        <Col xs={24} xl={18}>
          <Card title="Tạo giao dịch WU" size="small">
            <Form form={form} layout="vertical" onFinish={onCreate}
              onKeyDownCapture={preventNumberInputEnter}
              disabled={!canCreateTransaction}
              initialValues={{
                branchId: isBranchUser ? user?.branchId : undefined,
                paidCurrency: 'USD',
                payoutCurrency: 'USD',
                wuUsdAmount: 0,
                wuVndAmount: 0,
                receivedUsd: 0,
                receivedVnd: 0,
                appliedRate: 0,
              }}>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh" disabled={isBranchUser} options={branchOptions} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item
                  name="mtcn"
                  label="MSKH (10 số)"
                  rules={[{ required: true }, { pattern: /^\d{10}$/, message: '10 chữ số' }]}
                  getValueFromEvent={(event: ChangeEvent<HTMLInputElement>) => normalizeDigits(event.target.value, 10)}
                  getValueProps={(value) => ({ value: formatWuMtcn(value) })}
                >
                  <Input inputMode="numeric" maxLength={12} placeholder="633-775-1692" /></Form.Item></Col>
                <Col span={12}><Form.Item name="customerName" label="Tên khách"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="wuUsdAmount" label="Amount USD (WU)" rules={[positiveNumberRule('Amount USD (WU)')]}>
                  <InputNumber min={0} precision={2} keyboard={false} addonBefore="$" style={{ width: '100%' }} formatter={usdInputFormatter} parser={usdInputParser} /></Form.Item></Col>
                <Col span={12}><Form.Item name="wuVndAmount" label="Amount VND (WU)" rules={[positiveNumberRule('Amount VND (WU)')]}>
                  <InputNumber min={0} precision={0} keyboard={false} addonAfter="VND" style={{ width: '100%' }} formatter={numberInputFormatter} parser={numberInputParser} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="receivedVnd" label="Trả khách VND">
                  <InputNumber
                    min={0}
                    precision={0}
                    keyboard={false}
                    addonAfter="VND"
                    readOnly
                    controls={false}
                    style={{ width: '100%' }}
                    formatter={numberInputFormatter}
                    parser={numberInputParser}
                  /></Form.Item></Col>
                <Col span={12}><Form.Item name="receivedUsd" label="Trả khách USD (số nguyên)">
                  <InputNumber
                    min={0}
                    max={Math.trunc(Math.max(Number(wuUsd), 0))}
                    precision={0}
                    keyboard={false}
                    addonBefore="$"
                    readOnly={payoutCurrency === 'VND'}
                    controls={payoutCurrency === 'USD'}
                    style={{ width: '100%' }}
                    formatter={usdInputFormatter}
                    parser={usdInputParser}
                  /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="payoutCurrency" label="Tiền khách nhận">
                  <Segmented className="wu-currency-segmented" block options={['USD', 'VND']} /></Form.Item></Col>
                <Col span={12}><Form.Item name="paidCurrency" label="Paid Currency (WU hoàn)">
                  <Segmented className="wu-currency-segmented" block options={['USD', 'VND']} /></Form.Item></Col>
              </Row>
              <Form.Item name="appliedRate" label="Tỷ giá giao dịch" rules={[positiveNumberRule('Tỷ giá giao dịch')]}>
                <InputNumber min={rateBounds.min} max={rateBounds.max} precision={2} step={PAID_RATE_STEP} keyboard={false} addonAfter="VND/USD" style={{ width: '100%' }} formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser} />
              </Form.Item>
              <Slider
                min={rateBounds.min}
                max={rateBounds.max}
                step={PAID_RATE_STEP}
                value={clampPaidRate(transactionRate, implied, systemRate)}
                disabled={!systemRate || !implied}
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
                    <Typography.Text type="secondary">Tiền WU</Typography.Text>
                    <div className="text-lg font-semibold">{formatUsd(Number(wuUsd))} / {formatVnd(Number(wuVnd))}</div>
                    <Typography.Text type="secondary">WU rate {formatExchangeRate(implied)}</Typography.Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text type="secondary">Khách nhận</Typography.Text>
                    <div className="text-lg font-semibold">
                      {payoutCurrency === 'USD' ? `${formatUsd(receivedUsd, 0)} + ${formatVnd(receivedVnd)}` : formatVnd(receivedVnd)}
                    </div>
                    <Typography.Text type="secondary">
                      {payoutCurrency === 'USD'
                        ? `Phần còn lại ${(Math.max(Number(wuUsd) - receivedUsd, 0)).toFixed(2)} USD được quy đổi · Tổng ${formatVnd(payoutEquivalent)}`
                        : `${formatUsd(Number(wuUsd))} × ${formatExchangeRate(transactionRate)}`}
                    </Typography.Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text type="secondary">Tỷ giá</Typography.Text>
                    <div className="text-lg font-semibold">{formatExchangeRate(transactionRate)}</div>
                    <Typography.Text type="secondary">{rateType === 'PAID_BUY' ? 'Paid mua' : 'Paid bán'} {formatExchangeRate(systemRate ?? 0)}</Typography.Text>
                  </Col>
                </Row>
              </div>
              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message="Chưa có tỷ giá hệ thống ACTIVE cho WU. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch." />
              )}

              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={create.isPending} disabled={!canCreateTransaction || !systemRate} block>
                Tạo giao dịch
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </TransactionCreatePage>
  );
}

interface WuFormValues {
  branchId: string;
  mtcn: string;
  customerName?: string;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd?: number;
  receivedVnd?: number;
  appliedRate: number;
  payoutCurrency: 'USD' | 'VND';
  paidCurrency: 'USD' | 'VND';
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

function getWuPayout(
  payoutCurrency: string,
  wuUsd: number,
  transactionRate: number,
  currentReceivedUsd: number,
  resetReceivedUsd: boolean,
) {
  const safeWuUsd = Math.max(wuUsd, 0);
  const maxReceivedUsd = Math.trunc(safeWuUsd);
  const receivedUsd = payoutCurrency === 'VND'
    ? 0
    : resetReceivedUsd
      ? maxReceivedUsd
      : Math.min(Math.max(Math.trunc(currentReceivedUsd), 0), maxReceivedUsd);
  const convertedUsd = Math.max(safeWuUsd - receivedUsd, 0);

  return {
    receivedUsd,
    receivedVnd: Number.isFinite(transactionRate) && transactionRate > 0
      ? Math.round(convertedUsd * transactionRate)
      : 0,
  };
}
