// Flow MG — Tạo giao dịch MoneyGram (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Typography } from 'antd';
import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { useEffect, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
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
import { useBranches, useCreateMg } from '../hooks/useMg';
import type { ExchangeRateDto, ExchangeRateType, ServiceProvider } from '@/modules/exchange-rate/api/exchangeRate.api';

const positiveNumberRule = (label: string) => ({
  validator: (_: unknown, value: unknown) => {
    const numberValue = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isFinite(numberValue)) {
      return Promise.reject(new Error(`Vui lòng nhập ${label.toLowerCase()} hợp lệ`));
    }
    if (numberValue <= 0) return Promise.reject(new Error(`${label} phải lớn hơn 0`));
    return Promise.resolve();
  },
});

export function MgWorkspacePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { data: branches = [] } = useBranches();
  const { data: activeRates = [] } = useActiveRates();
  const create = useCreateMg();
  const [form] = Form.useForm();
  const user = useAuthStore((state) => state.user);
  const isBranchUser = user?.role === 'branch';
  const isControlUser = user?.role === 'director' || user?.role === 'accountant';
  const canCreateTransaction = (isBranchUser && Boolean(user?.branchId)) || isControlUser;
  const branchOptions = useMemo(
    () =>
      branches
        .filter((branch) => branch.type !== 'HEAD_OFFICE')
        .filter((branch) => !isBranchUser || branch.id === user?.branchId)
        .map((branch) => ({ value: branch.id, label: `${branch.code} — ${branch.name}` })),
    [branches, isBranchUser, user?.branchId],
  );

  useEffect(() => {
    if (isBranchUser && user?.branchId) {
      form.setFieldsValue({ branchId: user.branchId });
    }
  }, [form, isBranchUser, user?.branchId]);

  const paidCurrency = Form.useWatch('paidCurrency', form) ?? 'USD';
  const paidAmount = Number(Form.useWatch('paidAmount', form) ?? 0);
  const payoutCurrency = Form.useWatch('payoutCurrency', form) ?? 'VND';
  const payoutAmount = Number(Form.useWatch('payoutAmount', form) ?? 0);
  const receivedUsd = Number(Form.useWatch('receivedUsd', form) ?? 0);
  const receivedVnd = Number(Form.useWatch('receivedVnd', form) ?? 0);
  const rateType: ExchangeRateType = payoutCurrency === 'VND' ? 'PAID_BUY' : 'PAID_SELL';
  const systemRate = findActiveRate(activeRates, rateType, 'USD', 'WU_MG')?.rate;
  const splitPayout = splitMgPayout(payoutCurrency, payoutAmount, Number(systemRate ?? 0));

  useEffect(() => {
    if (systemRate) {
      form.setFieldsValue({ appliedRate: systemRate });
    }
  }, [form, systemRate]);

  useEffect(() => {
    if (!systemRate || paidAmount <= 0) return;

    form.setFieldsValue({
      payoutAmount: getSuggestedPayoutAmount(paidCurrency, paidAmount, payoutCurrency, systemRate),
    });
  }, [form, paidAmount, paidCurrency, payoutCurrency, systemRate]);

  useEffect(() => {
    form.setFieldsValue({
      receivedUsd: splitPayout.receivedUsd,
      receivedVnd: splitPayout.receivedVnd,
    });
  }, [form, splitPayout.receivedUsd, splitPayout.receivedVnd]);

  const onCreate = async (v: any) => {
    if (!canCreateTransaction) {
      await message.error('Cần có quyền chi nhánh hoặc quyền GĐ/KTTH để tạo giao dịch MG');
      return;
    }

    try {
      const normalized = normalizeMgAmounts(v.paidCurrency, Number(v.paidAmount ?? 0));
      await create.mutateAsync({
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
      });
      message.success('Đã tạo GD MG — quỹ giảm, công nợ MG tăng');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Tạo GD thất bại');
    }
  };

  return (
    <PageScaffold
      title="Giao dịch MoneyGram"
      description="Giống Western Union, khóa = Reference Number (mỗi Ref chỉ xử lý 1 lần)."
      moduleName="moneygram"
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>Quay lại Giao Dịch</Button>}
    >
      <Row justify="center">
        <Col xs={24} xl={18}>
          <Card title="Tạo giao dịch MG" size="small">
            <Form form={form} layout="vertical" onFinish={onCreate}
              disabled={!canCreateTransaction}
              initialValues={{ paidCurrency: 'USD', payoutCurrency: 'VND', paidAmount: 0, payoutAmount: 0, receivedUsd: 0, receivedVnd: 0 }}>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh"
                  disabled={isBranchUser}
                  options={branchOptions} />
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
                <Col span={12}><Form.Item name="paidCurrency" label="MG hiện tiền">
                  <Segmented options={['USD', 'VND']} /></Form.Item></Col>
                <Col span={12}><Form.Item name="paidAmount" label="Số tiền MG" rules={[positiveNumberRule('Số tiền MG')]}>
                  <InputNumber
                    min={0}
                    precision={paidCurrency === 'USD' ? 2 : 0}
                    addonBefore={paidCurrency === 'USD' ? '$' : undefined}
                    addonAfter={paidCurrency === 'VND' ? 'VND' : undefined}
                    style={{ width: '100%' }}
                    formatter={paidCurrency === 'USD' ? usdInputFormatter : numberInputFormatter}
                    parser={paidCurrency === 'USD' ? usdInputParser : numberInputParser}
                  />
                </Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="payoutCurrency" label="Khách nhận">
                  <Segmented options={['VND', 'USD']} /></Form.Item></Col>
                <Col span={12}><Form.Item name="payoutAmount" label="Số tiền khách nhận theo MG" rules={[positiveNumberRule('Số tiền khách nhận')]}>
                  <InputNumber
                    min={0}
                    precision={payoutCurrency === 'USD' ? 2 : 0}
                    addonBefore={payoutCurrency === 'USD' ? '$' : undefined}
                    addonAfter={payoutCurrency === 'VND' ? 'VND' : undefined}
                    style={{ width: '100%' }}
                    formatter={payoutCurrency === 'USD' ? usdInputFormatter : numberInputFormatter}
                    parser={payoutCurrency === 'USD' ? usdInputParser : numberInputParser}
                  />
                </Form.Item></Col>
              </Row>
              <Row gutter={8}>
                {payoutCurrency === 'USD' && (
                  <Col span={12}><Form.Item name="receivedUsd" label="Trả khách USD chẵn">
                    <InputNumber
                      min={0}
                      precision={0}
                      addonBefore="$"
                      readOnly
                      controls={false}
                      style={{ width: '100%' }}
                      formatter={usdInputFormatter}
                      parser={usdInputParser}
                    />
                  </Form.Item></Col>
                )}
                <Col span={payoutCurrency === 'USD' ? 12 : 24}><Form.Item name="receivedVnd" label={payoutCurrency === 'USD' ? 'Trả khách VND phần lẻ' : 'Trả khách VND'}>
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
              </Row>
              <Form.Item name="appliedRate" label="Tỷ giá áp dụng" rules={[positiveNumberRule('Tỷ giá áp dụng')]}>
                <InputNumber min={0} precision={2} addonAfter="VND/USD" readOnly controls={false} style={{ width: '100%' }} formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser} />
              </Form.Item>

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
                        ? `USD lẻ ${formatUsd(splitPayout.fractionalUsd)} quy đổi VND`
                        : 'VND'}
                    </Typography.Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Typography.Text type="secondary">Tỷ giá áp dụng</Typography.Text>
                    <div className="text-lg font-semibold">{formatExchangeRate(systemRate ?? 0)}</div>
                    <Typography.Text type="secondary">{rateType === 'PAID_BUY' ? 'Paid mua' : 'Paid bán'} active</Typography.Text>
                  </Col>
                </Row>
              </div>

              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message="Chưa có tỷ giá hệ thống ACTIVE cho MG. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch." />
              )}

              {!canCreateTransaction && (
                <Alert type="info" showIcon className="mb-3" message="Đăng nhập bằng tài khoản chi nhánh hoặc GĐ/KTTH để tạo giao dịch." />
              )}

              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={create.isPending} disabled={!canCreateTransaction || !systemRate} block>
                Tạo giao dịch
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </PageScaffold>
  );
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

function splitMgPayout(payoutCurrency: string, payoutAmount: number, appliedRate: number) {
  if (payoutCurrency === 'VND') {
    return {
      receivedUsd: 0,
      receivedVnd: Math.round(Math.max(payoutAmount, 0)),
      fractionalUsd: 0,
    };
  }

  const receivedUsd = Math.trunc(Math.max(payoutAmount, 0));
  const fractionalUsd = Math.max(payoutAmount - receivedUsd, 0);

  return {
    receivedUsd,
    receivedVnd: Math.round(fractionalUsd * Math.max(appliedRate, 0)),
    fractionalUsd,
  };
}
