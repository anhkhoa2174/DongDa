// Flow FX — Mua/Bán ngoại tệ (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, SwapOutlined } from '@ant-design/icons';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { useBranches, useCreateFx, useFxStock } from '../hooks/useFx';
import type { FxStockDto } from '../api/fx.api';
import type { ExchangeRateDto, ExchangeRateType, ServiceProvider } from '@/modules/exchange-rate/api/exchangeRate.api';

const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'AUD', 'SGD', 'CNY', 'KRW', 'THB', 'HKD'];
const money = (n: number) => n.toLocaleString('vi-VN');
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

export function FxWorkspacePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { data: stock = [] } = useFxStock();
  const { data: branches = [] } = useBranches();
  const { data: activeRates = [] } = useActiveRates();
  const create = useCreateFx();
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

  const amount = Form.useWatch('fxAmount', form) ?? 0;
  const rate = Form.useWatch('rate', form) ?? 0;
  const side = Form.useWatch('side', form) ?? 'buy';
  const fxCurrency = Form.useWatch('fxCurrency', form) ?? 'USD';
  const systemRate = findActiveRate(activeRates, side === 'buy' ? 'FX_BUY' : 'FX_SELL', fxCurrency, 'INTERNAL')?.rate;

  useEffect(() => {
    if (systemRate) {
      form.setFieldsValue({ rate: systemRate });
    }
  }, [form, systemRate]);

  const onCreate = async (v: any) => {
    if (!canCreateTransaction) {
      await message.error('Cần có quyền chi nhánh hoặc quyền GĐ/KTTH để tạo giao dịch ngoại tệ');
      return;
    }

    try {
      await create.mutateAsync({
        branchId: isBranchUser && user?.branchId ? user.branchId : v.branchId,
        isBuy: v.side === 'buy',
        fxCurrency: v.fxCurrency,
        fxAmount: v.fxAmount, rate: v.rate, customerName: v.customerName,
      });
      message.success(v.side === 'buy' ? 'Đã mua ngoại tệ — tồn tăng, quỹ VND giảm' : 'Đã bán ngoại tệ — tồn giảm, quỹ VND tăng');
      form.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Giao dịch thất bại');
    }
  };

  const branchCode = (id: string) => branches.find((b) => b.id === id)?.code ?? id.slice(0, 6);

  const stockCols: ColumnsType<FxStockDto> = [
    { title: 'CN', dataIndex: 'branchId', render: branchCode },
    { title: 'Ngoại tệ', dataIndex: 'currency' },
    { title: 'Tồn', dataIndex: 'balance', align: 'right', render: (v) => <Typography.Text strong>{money(v)}</Typography.Text> },
  ];

  return (
    <PageScaffold
      title="Mua / Bán ngoại tệ"
      description="Mua (khách bán cho công ty): quỹ VND giảm, tồn ngoại tệ tăng. Bán: ngược lại. Không bán vượt tồn."
      moduleName="foreign-exchange"
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>Quay lại Giao Dịch</Button>}
    >
      <Row justify="center">
        <Col xs={24} xl={16}>
          <Card title="Giao dịch ngoại tệ" size="small" className="mb-4">
            <Form form={form} layout="vertical" onFinish={onCreate} disabled={!canCreateTransaction} initialValues={{ side: 'buy', fxCurrency: 'USD' }}>
              <Form.Item name="side" label="Loại giao dịch">
                <Segmented block options={[{ label: 'MUA (khách bán)', value: 'buy' }, { label: 'BÁN (khách mua)', value: 'sell' }]} />
              </Form.Item>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh"
                  disabled={isBranchUser}
                  options={branchOptions} />
              </Form.Item>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="fxCurrency" label="Ngoại tệ" rules={[{ required: true }]}>
                  <Select options={CURRENCIES.map((v) => ({ value: v, label: v }))} /></Form.Item></Col>
                <Col span={12}><Form.Item name="fxAmount" label="Số lượng" rules={[positiveNumberRule('Số lượng')]}>
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} formatter={usdInputFormatter} parser={usdInputParser} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="rate" label={side === 'buy' ? 'Giá mua' : 'Giá bán'} rules={[positiveNumberRule(side === 'buy' ? 'Giá mua' : 'Giá bán')]}>
                  <InputNumber min={0} precision={2} addonAfter="VND" readOnly controls={false} style={{ width: '100%' }} formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser} /></Form.Item></Col>
                <Col span={12}><Form.Item name="customerName" label="Khách"><Input /></Form.Item></Col>
              </Row>
              <Typography.Paragraph type="secondary">
                Thành tiền: <Typography.Text strong>{money(Math.round(amount * rate))}đ</Typography.Text>
              </Typography.Paragraph>
              {!canCreateTransaction && (
                <Alert type="info" showIcon className="mb-3" message="Đăng nhập bằng tài khoản chi nhánh hoặc GĐ/KTTH để tạo giao dịch." />
              )}
              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message={`Chưa có tỷ giá ${side === 'buy' ? 'mua' : 'bán'} ACTIVE cho ${fxCurrency}. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch.`} />
              )}
              <Button type="primary" htmlType="submit" icon={<SwapOutlined />} loading={create.isPending} disabled={!canCreateTransaction || !systemRate} block>
                {side === 'buy' ? 'Mua ngoại tệ' : 'Bán ngoại tệ'}
              </Button>
            </Form>
          </Card>
          <Card title="Tồn ngoại tệ (Quỹ A)" size="small">
            <Table<FxStockDto> rowKey={(r) => r.branchId + r.currency} size="small" columns={stockCols}
              dataSource={stock} pagination={false} scroll={{ y: 250 }} />
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
