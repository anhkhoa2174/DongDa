// Flow WU — Tạo giao dịch Western Union (nối API thật)
import { App, Alert, Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, Row, Segmented, Select, Slider, Typography } from 'antd';
import { DownloadOutlined, SendOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Dayjs } from 'dayjs';
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
import { wuApi } from '../api/wu.api';
import type { CreateWuPayload } from '../api/wu.api';
import { useBankAccounts } from '@/modules/bank-management/hooks/useBank';

export function WuWorkspacePage() {
  const { message } = App.useApp();
  const { data: activeRates = [] } = useActiveRates();
  const { data: bankAccounts = [] } = useBankAccounts();
  const create = useCreateWu();
  const [exportingBank, setExportingBank] = useState<'ACB' | 'MSB' | null>(null);
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
  const paidCurrency = Form.useWatch('paidCurrency', form) ?? 'USD';
  const bankAccountId = Form.useWatch('bankAccountId', form);
  const eligibleBankAccounts = bankAccounts.filter((account) => (
    account.status === 'ACTIVE' && account.currencyCode === paidCurrency
  ));
  const selectedBank = eligibleBankAccounts.find((account) => account.id === bankAccountId);
  const rateType: ExchangeRateType = payoutCurrency === 'VND' ? 'PAID_BUY' : 'PAID_SELL';
  const systemRate = findActiveRate(activeRates, rateType, 'USD', 'WU_MG')?.rate;
  const rateSelectionKey = `${rateType}:${systemRate ?? 0}`;
  const implied = wuUsd > 0 ? wuVnd / wuUsd : 0;
  const rateBounds = getPaidRateBounds(implied, systemRate);
  const receivedUsd = Number(Form.useWatch('receivedUsd', form) ?? 0);
  const receivedVnd = Number(Form.useWatch('receivedVnd', form) ?? 0);
  const hasVisa = Form.useWatch('hasVisa', form) ?? false;
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

  useEffect(() => {
    if (!hasVisa) form.setFieldsValue({ visaNumber: undefined, visaIssueDate: undefined, visaExpiryDate: undefined });
  }, [form, hasVisa]);

  useEffect(() => {
    if (bankAccountId && !eligibleBankAccounts.some((account) => account.id === bankAccountId)) {
      form.setFieldValue('bankAccountId', undefined);
    }
  }, [bankAccountId, eligibleBankAccounts, form]);

  const toPayload = (v: WuFormValues): CreateWuPayload => ({
    branchId: isBranchUser && user?.branchId ? user.branchId : v.branchId,
    bankAccountId: v.bankAccountId,
    mtcn: v.mtcn,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    sendingCountry: v.sendingCountry,
    senderState: v.senderState,
    receiverDateOfBirth: v.receiverDateOfBirth.format('YYYY-MM-DD'),
    currentAddress: v.currentAddress,
    identityAddress: v.identityAddress,
    identityDocumentType: v.identityDocumentType,
    identityDocumentNumber: v.identityDocumentNumber,
    identityIssuingCountry: v.identityIssuingCountry,
    identityIssueDate: v.identityIssueDate.format('YYYY-MM-DD'),
    identityExpiryDate: v.identityExpiryDate.format('YYYY-MM-DD'),
    hasVisa: v.hasVisa,
    visaNumber: v.hasVisa ? v.visaNumber : undefined,
    visaIssueDate: v.hasVisa ? v.visaIssueDate?.format('YYYY-MM-DD') : undefined,
    visaExpiryDate: v.hasVisa ? v.visaExpiryDate?.format('YYYY-MM-DD') : undefined,
    employmentStatus: v.employmentStatus,
    countryOfBirth: v.countryOfBirth,
    senderRelationship: v.senderRelationship,
    receivePurpose: v.receivePurpose,
    senderName: v.senderName,
    receivedDate: v.receivedDate.format('YYYY-MM-DD'),
    wuUsdAmount: v.wuUsdAmount,
    wuVndAmount: v.wuVndAmount,
    receivedUsd: v.receivedUsd ?? 0,
    receivedVnd: v.receivedVnd ?? 0,
    appliedRate: v.appliedRate,
    payoutCurrency: v.payoutCurrency,
    paidCurrency: v.paidCurrency,
  });

  const onCreate = async (v: WuFormValues) => {
    if (!canCreateTransaction) {
      await message.error('Cần có quyền chi nhánh hoặc quyền GĐ/KTTH để tạo giao dịch WU');
      return;
    }

    try {
      await create.mutateAsync(toPayload(v));
      message.success('Đã tạo GD WU — quỹ giảm, công nợ WU tăng');
      resetTransactionForm();
      previousPayoutCurrency.current = undefined;
      previousRateSelectionKey.current = undefined;
      previousWuUsd.current = undefined;
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Tạo GD thất bại'));
    }
  };

  const onExport = async (bank: 'ACB' | 'MSB') => {
    try {
      const values = await form.validateFields() as WuFormValues;
      setExportingBank(bank);
      const blob = await wuApi.exportForm(bank, toPayload(values));
      downloadBlob(blob, `WU-${bank}-${values.mtcn}.xlsx`);
      message.success(`Đã xuất phiếu ${bank}`);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error(getApiErrorMessage(error, `Không thể xuất phiếu ${bank}`));
    } finally {
      setExportingBank(null);
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
                hasVisa: false,
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
                <Col span={12}><Form.Item name="customerName" label="Tên người nhận" rules={[requiredRule]}><Input /></Form.Item></Col>
              </Row>
              <Typography.Title level={5}>Thông tin giao dịch và người gửi</Typography.Title>
              <Row gutter={8}>
                <Col xs={24} md={12}><Form.Item name="sendingCountry" label="Nước gửi tiền" rules={[requiredRule]}><Input placeholder="AUSTRALIA" /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="senderState" label="Tiểu bang (USA, CAN, MEX)" extra="Không bắt buộc"><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col xs={24} md={12}><Form.Item name="senderName" label="Tên người gửi" rules={[requiredRule]}><Input /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="receivedDate" label="Ngày nhận tiền" rules={[requiredRule]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col xs={24} md={12}><Form.Item name="senderRelationship" label="Quan hệ với người gửi" rules={[requiredRule]}><Select options={relationshipOptions} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="receivePurpose" label="Mục đích nhận tiền" rules={[requiredRule]}><Select options={purposeOptions} /></Form.Item></Col>
              </Row>

              <Typography.Title level={5}>Thông tin người nhận</Typography.Title>
              <Row gutter={8}>
                <Col xs={24} md={12}><Form.Item name="receiverDateOfBirth" label="Ngày sinh" rules={[requiredRule]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="customerPhone" label="Số điện thoại" rules={[requiredRule]}><Input inputMode="tel" /></Form.Item></Col>
              </Row>
              <Form.Item name="currentAddress" label="Địa chỉ hiện tại" rules={[requiredRule]}><Input /></Form.Item>
              <Form.Item name="identityAddress" label="Địa chỉ CCCD" extra="Không bắt buộc"><Input /></Form.Item>
              <Row gutter={8}>
                <Col xs={24} md={12}><Form.Item name="employmentStatus" label="Tình trạng việc làm" rules={[requiredRule]}><Select options={employmentOptions} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="countryOfBirth" label="Quốc gia khai sinh" rules={[requiredRule]}><Input /></Form.Item></Col>
              </Row>

              <Typography.Title level={5}>Giấy tờ tùy thân</Typography.Title>
              <Row gutter={8}>
                <Col xs={24} md={12}><Form.Item name="identityDocumentType" label="Loại giấy tờ tùy thân" rules={[requiredRule]}><Select options={[{ value: 'PASSPORT', label: 'Passport' }, { value: 'CCCD', label: 'CCCD' }]} /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="identityDocumentNumber" label="Số giấy tờ / Passport" rules={[requiredRule]}><Input /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col xs={24} md={8}><Form.Item name="identityIssuingCountry" label="Quốc gia cấp" rules={[requiredRule]}><Input /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name="identityIssueDate" label="Ngày cấp" rules={[requiredRule]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name="identityExpiryDate" label="Ngày hết hạn" rules={[requiredRule]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
              </Row>

              <Typography.Title level={5}>Thông tin Visa</Typography.Title>
              <Form.Item name="hasVisa" valuePropName="checked"><Checkbox>Có Visa</Checkbox></Form.Item>
              {hasVisa && (
                <Row gutter={8}>
                  <Col xs={24} md={8}><Form.Item name="visaNumber" label="Số Visa" rules={[requiredRule]}><Input /></Form.Item></Col>
                  <Col xs={24} md={8}><Form.Item name="visaIssueDate" label="Ngày cấp Visa" rules={[requiredRule]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
                  <Col xs={24} md={8}><Form.Item name="visaExpiryDate" label="Ngày hết hạn Visa" rules={[requiredRule]}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item></Col>
                </Row>
              )}

              <Typography.Title level={5}>Thông tin chi trả</Typography.Title>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="wuUsdAmount" label="Số tiền nhận (USD/WU)" rules={[positiveNumberRule('Số tiền nhận (USD/WU)')]}>
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
              <Form.Item
                name="bankAccountId"
                label="Ngân hàng nhận thanh toán công nợ"
                rules={[{ required: true, message: `Chọn tài khoản ngân hàng ${paidCurrency}` }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={`Chọn tài khoản ngân hàng ${paidCurrency}`}
                  notFoundContent={`Không có tài khoản ${paidCurrency} đang hoạt động trong công ty`}
                  options={eligibleBankAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.bankCode} - ${account.accountNo} - ${account.accountName}${account.branchName ? ` (${account.branchName})` : ''}`,
                  }))}
                />
              </Form.Item>
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
                  <Col xs={24}>
                    <Typography.Text type="secondary">Ngân hàng thanh toán công nợ</Typography.Text>
                    <div className="font-semibold">{selectedBank ? `${selectedBank.bankCode} - ${selectedBank.accountNo}` : 'Chưa chọn'}</div>
                  </Col>
                </Row>
              </div>
              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message="Chưa có tỷ giá hệ thống ACTIVE cho WU. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch." />
              )}

              <Row gutter={8} className="mb-3">
                <Col xs={24} md={12}>
                  <Button icon={<DownloadOutlined />} loading={exportingBank === 'MSB'} disabled={!canCreateTransaction || exportingBank !== null} onClick={() => onExport('MSB')} block>
                    Xuất phiếu MSB
                  </Button>
                </Col>
                <Col xs={24} md={12}>
                  <Button icon={<DownloadOutlined />} loading={exportingBank === 'ACB'} disabled={!canCreateTransaction || exportingBank !== null} onClick={() => onExport('ACB')} block>
                    Xuất phiếu ACB
                  </Button>
                </Col>
              </Row>

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
  bankAccountId: string;
  mtcn: string;
  customerName?: string;
  customerPhone: string;
  sendingCountry: string;
  senderState?: string;
  receiverDateOfBirth: Dayjs;
  currentAddress: string;
  identityAddress?: string;
  identityDocumentType: string;
  identityDocumentNumber: string;
  identityIssuingCountry: string;
  identityIssueDate: Dayjs;
  identityExpiryDate: Dayjs;
  hasVisa: boolean;
  visaNumber?: string;
  visaIssueDate?: Dayjs;
  visaExpiryDate?: Dayjs;
  employmentStatus: string;
  countryOfBirth: string;
  senderRelationship: string;
  receivePurpose: string;
  senderName: string;
  receivedDate: Dayjs;
  wuUsdAmount: number;
  wuVndAmount: number;
  receivedUsd?: number;
  receivedVnd?: number;
  appliedRate: number;
  payoutCurrency: 'USD' | 'VND';
  paidCurrency: 'USD' | 'VND';
}

const requiredRule = { required: true, message: 'Vui lòng nhập thông tin' };
const relationshipOptions = [
  { value: 'FAMILY', label: 'Gia đình (FAMILY)' },
  { value: 'FRIEND', label: 'Bạn bè (FRIEND)' },
  { value: 'BUSINESS', label: 'Công việc (BUSINESS)' },
  { value: 'OTHER', label: 'Khác (OTHER)' },
];
const purposeOptions = [
  { value: 'TRAVEL_EXPENSE', label: 'Chi phí đi lại (TRAVEL EXPENSE)' },
  { value: 'FAMILY_SUPPORT', label: 'Hỗ trợ gia đình (FAMILY SUPPORT)' },
  { value: 'EDUCATION', label: 'Giáo dục (EDUCATION)' },
  { value: 'MEDICAL', label: 'Y tế (MEDICAL)' },
  { value: 'OTHER', label: 'Khác (OTHER)' },
];
const employmentOptions = [
  { value: 'FREELANCER', label: 'Nghề tự do / Freelancer' },
  { value: 'EMPLOYED', label: 'Đang làm việc / Employed' },
  { value: 'SELF_EMPLOYED', label: 'Tự kinh doanh / Self-employed' },
  { value: 'RETIRED', label: 'Nghỉ hưu / Retired' },
  { value: 'UNEMPLOYED', label: 'Không có việc làm / Unemployed' },
];
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
