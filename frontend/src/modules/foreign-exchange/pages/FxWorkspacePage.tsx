// Flow FX — Mua/Bán ngoại tệ (nối API thật)
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Segmented, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, SwapOutlined } from '@ant-design/icons';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { preventNumberInputEnter } from '@/shared/utils/formEvents';
import { currencyOptions, getCurrencyMetadata } from '@/shared/constants/currencies';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useActiveRates } from '@/modules/exchange-rate/hooks/useExchangeRates';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatNumber,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { useBranches, useCreateFx, useFxStock } from '../hooks/useFx';
import type { ExchangeRateDto, ExchangeRateType, ServiceProvider } from '@/modules/exchange-rate/api/exchangeRate.api';

const FX_CURRENCY_OPTIONS = currencyOptions.filter((currency) => currency.value !== 'VND');
const money = (n: number) => formatNumber(n, 2);
type FxStockRow = {
  currency: string;
  total: number;
  hasBalance: boolean;
  balanceByBranch: Record<string, number>;
};
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

  const resetTransactionForm = () => {
    form.resetFields();
    if (isBranchUser && user?.branchId) {
      form.setFieldValue('branchId', user.branchId);
    }
  };

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
      resetTransactionForm();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Giao dịch thất bại');
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
      ...FX_CURRENCY_OPTIONS.map((option) => option.value),
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

  const stockCols: ColumnsType<FxStockRow> = [
    {
      title: 'Ngoại tệ',
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
          <Typography.Text strong>{branch.type === 'HEAD_OFFICE' ? 'Quỹ A Hội sở' : branch.code}</Typography.Text>
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
    <PageScaffold
      title="Mua / Bán ngoại tệ"
      description="Mua (khách bán cho công ty): quỹ VND giảm, tồn ngoại tệ tăng. Bán: ngược lại. Không bán vượt tồn."
      moduleName="foreign-exchange"
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>Quay lại Giao Dịch</Button>}
    >
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={10} xl={9}>
          <Card title="Giao dịch ngoại tệ" size="small" className="h-full">
            <Form
              form={form}
              layout="vertical"
              onFinish={onCreate}
              onKeyDownCapture={preventNumberInputEnter}
              disabled={!canCreateTransaction}
              initialValues={{ branchId: isBranchUser ? user?.branchId : undefined, side: 'buy', fxCurrency: 'USD', fxAmount: 0, rate: 0 }}
            >
              <Form.Item name="side" label="Loại giao dịch">
                <Segmented block options={[{ label: 'MUA (khách bán)', value: 'buy' }, { label: 'BÁN (khách mua)', value: 'sell' }]} />
              </Form.Item>
              <Form.Item name="branchId" label="Chi nhánh" rules={[{ required: true }]}>
                <Select placeholder="Chọn chi nhánh" disabled={isBranchUser} options={branchOptions} />
              </Form.Item>
              <Row gutter={8}>
                <Col xs={24} sm={12}><Form.Item name="fxCurrency" label="Ngoại tệ" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" options={FX_CURRENCY_OPTIONS} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="fxAmount" label="Số lượng" rules={[positiveNumberRule('Số lượng')]}>
                  <InputNumber min={0} precision={2} keyboard={false} style={{ width: '100%' }} formatter={usdInputFormatter} parser={usdInputParser} /></Form.Item></Col>
              </Row>
              <Row gutter={8}>
                <Col xs={24} sm={12}><Form.Item name="rate" label={side === 'buy' ? 'Giá mua' : 'Giá bán'} rules={[positiveNumberRule(side === 'buy' ? 'Giá mua' : 'Giá bán')]}>
                  <InputNumber min={0} precision={6} addonAfter="VND" readOnly controls={false} style={{ width: '100%' }} formatter={exchangeRateInputFormatter} parser={exchangeRateInputParser} /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="customerName" label="Khách"><Input /></Form.Item></Col>
              </Row>
              <div className="mb-4 border-y border-slate-200 bg-slate-50 px-4 py-3">
                <Typography.Text strong>Tóm tắt giao dịch</Typography.Text>
                <Row gutter={[16, 12]} className="mt-3">
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">Loại tiền</Typography.Text>
                    <div className="mt-1 text-base font-semibold text-slate-900">{fxCurrency}</div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">Số lượng</Typography.Text>
                    <div className="mt-1 text-base font-semibold text-slate-900">{money(Number(amount))} {fxCurrency}</div>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Typography.Text type="secondary">Thành tiền</Typography.Text>
                    <div className="mt-1 text-lg font-semibold text-brand-700">{formatNumber(Math.round(Number(amount) * Number(rate)), 0)} VND</div>
                  </Col>
                </Row>
              </div>
              {!systemRate && (
                <Alert type="warning" showIcon className="mb-3" message={`Chưa có tỷ giá ${side === 'buy' ? 'mua' : 'bán'} ACTIVE cho ${fxCurrency}. Vui lòng tạo/duyệt tỷ giá trước khi giao dịch.`} />
              )}
              <Button type="primary" htmlType="submit" icon={<SwapOutlined />} loading={create.isPending} disabled={!canCreateTransaction || !systemRate} block>
                {side === 'buy' ? 'Mua ngoại tệ' : 'Bán ngoại tệ'}
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={14} xl={15}>
          <Card
            title="Tồn ngoại tệ theo chi nhánh"
            size="small"
            className="h-full"
            extra={<Typography.Text type="secondary" className="text-xs!">Tự cập nhật mỗi 10 giây</Typography.Text>}
          >
            <Table<FxStockRow>
              rowKey="currency"
              size="small"
              columns={stockCols}
              dataSource={stockRows}
              pagination={false}
              scroll={{ x: Math.max(560, 270 + stockBranches.length * 145) }}
              rowClassName={(row) => row.hasBalance ? 'fx-stock-row--active' : 'fx-stock-row--empty'}
            />
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
