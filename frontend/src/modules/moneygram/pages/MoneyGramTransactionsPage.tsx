import { Alert, Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  TransactionWorkspacePage,
  type TransactionField,
  type TransactionFormValues,
} from '@/modules/transactions/components/TransactionWorkspacePage';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';
import { activePaidRatesMock } from '@/modules/exchange-rate/data/exchangeRates.mock';
import { bankAccountsMock } from '@/modules/bank-management/data/bankAccounts.mock';
import { formatExchangeRate, formatUsd, formatVnd as formatBaseVnd } from '@/shared/utils/formatters';
import { moneyGramTransactionsMock } from '../data/transactions.mock';

const typeLabels: Record<string, string> = {
  RECEIVE_USD: 'Khách nhận USD',
  RECEIVE_VND: 'Khách nhận VND',
};

const bankOptions = Array.from(new Map(
  bankAccountsMock.map((account) => [
    account.bankCode,
    { value: account.bankCode, label: `${account.bankCode} - ${account.bankName}` },
  ]),
).values());

const fields: TransactionField[] = [
  { name: 'customerCode', label: 'MSKH', kind: 'text', required: true, span: 8, maxLength: 8, pattern: /^\d{8}$/, patternMessage: 'MSKH MoneyGram phải gồm đúng 8 ký tự', placeholder: 'Nhập đúng 8 số' },
  { name: 'customerName', label: 'Tên khách hàng', kind: 'text', required: true, span: 8 },
  { name: 'phone', label: 'Số điện thoại (optional)', kind: 'text', span: 8 },
  {
    name: 'paidCurrency',
    label: 'Paid Currency',
    kind: 'segmented',
    required: true,
    span: 8,
    options: [
      { value: 'USD', label: 'USD' },
      { value: 'VND', label: 'VND' },
    ],
  },
  {
    name: 'transactionType',
    label: 'Pay Currency (trả khách)',
    kind: 'segmented',
    required: true,
    span: 8,
    options: Object.entries(typeLabels).map(([value, label]) => ({ value, label: label.replace('Khách nhận ', '') })),
  },
  { name: 'appliedPaidRate', label: 'Applied Rate', kind: 'number', span: 8, readOnly: true },
  {
    name: 'paidUsd',
    label: 'Amount USD',
    kind: 'number',
    required: true,
    span: 8,
    precision: 2,
    prefix: '$',
    visibleWhen: (values) => values.paidCurrency === 'USD',
  },
  {
    name: 'paidVnd',
    label: 'Amount VND',
    kind: 'number',
    required: true,
    span: 8,
    prefix: '₫',
    visibleWhen: (values) => values.paidCurrency === 'VND',
  },
  {
    name: 'receivedUsd',
    label: 'Khách nhận USD',
    kind: 'number',
    required: true,
    span: 8,
    precision: 2,
    prefix: '$',
    visibleWhen: (values) => values.transactionType === 'RECEIVE_USD',
  },
  {
    name: 'receivedVnd',
    label: 'Khách nhận VND',
    kind: 'number',
    required: true,
    span: 8,
    prefix: '₫',
    visibleWhen: (values) => values.transactionType === 'RECEIVE_VND',
  },
  { name: 'mgRate', label: 'MG Implied Rate (auto)', kind: 'number', span: 8, readOnly: true, precision: 4 },
  {
    name: 'transactionRate',
    label: 'Tỷ giá giao dịch',
    kind: 'slider',
    span: 8,
    precision: 2,
    step: 50,
    rangeMinField: 'mgRate',
    rangeMaxField: 'appliedPaidRate',
  },
  { name: 'bank', label: 'Ngân hàng', kind: 'select', span: 8, placeholder: 'Chọn ngân hàng đang dùng', options: bankOptions },
];

const initialFormValues: TransactionFormValues = {
  transactionType: 'RECEIVE_USD',
  paidCurrency: 'USD',
  appliedPaidRate: activePaidRatesMock.paidSell,
  transactionRate: activePaidRatesMock.paidSell,
};

function handleValuesChange(
  changedValues: TransactionFormValues,
  allValues: TransactionFormValues,
  form: FormInstance<TransactionFormValues>,
) {
  if ('paidCurrency' in changedValues) {
    const paidUsd = changedValues.paidCurrency === 'USD';
    form.setFieldsValue({
      paidUsd: paidUsd ? allValues.paidUsd : undefined,
      paidVnd: paidUsd ? undefined : allValues.paidVnd,
    });
  }

  if ('transactionType' in changedValues) {
    const receivesUsd = changedValues.transactionType === 'RECEIVE_USD';
    const appliedPaidRate = receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy;
    form.setFieldsValue({
      appliedPaidRate,
      transactionRate: clampRate(Number(allValues.transactionRate ?? appliedPaidRate), getMgRate(allValues), appliedPaidRate),
      receivedUsd: receivesUsd ? allValues.receivedUsd : undefined,
      receivedVnd: receivesUsd ? undefined : allValues.receivedVnd,
    });
  }

  if (['paidUsd', 'paidVnd', 'receivedUsd', 'receivedVnd', 'paidCurrency', 'transactionType', 'transactionRate'].some((key) => key in changedValues)) {
    const mgRate = getMgRate(allValues);
    const appliedPaidRate = Number(allValues.appliedPaidRate ?? (allValues.transactionType === 'RECEIVE_USD' ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy));
    const transactionRate = clampRate(Number(allValues.transactionRate ?? appliedPaidRate), mgRate, appliedPaidRate);
    const shouldSuggestReceive = ['paidUsd', 'paidVnd', 'paidCurrency', 'transactionType', 'transactionRate'].some((key) => key in changedValues);

    form.setFieldsValue({
      mgRate,
      transactionRate,
      ...(shouldSuggestReceive ? getSuggestedReceiveAmounts(allValues, transactionRate) : {}),
    });
  }
}

function transformValues(values: TransactionFormValues): TransactionFormValues {
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const amount = Number(receivesUsd ? values.receivedUsd : values.receivedVnd);
  const transactionRate = Number(values.transactionRate ?? values.appliedPaidRate ?? 0);
  const vndAmount = receivesUsd
    ? amount * transactionRate
    : amount;

  return {
    ...values,
    appliedPaidRate: values.appliedPaidRate ?? (receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy),
    transactionRate,
    currency: receivesUsd ? 'USD' : 'VND',
    amount,
    vndAmount,
  };
}

function getMgRate(values: TransactionFormValues) {
  const paidUsd = Number(values.paidUsd ?? 0);
  const paidVnd = Number(values.paidVnd ?? 0);
  const receivedUsd = Number(values.receivedUsd ?? 0);
  const receivedVnd = Number(values.receivedVnd ?? 0);
  const usdAmount = paidUsd || receivedUsd;
  const vndAmount = paidVnd || receivedVnd;

  return usdAmount > 0 && vndAmount > 0 ? vndAmount / usdAmount : undefined;
}

function clampRate(value: number, firstRate?: number, secondRate?: number) {
  const rates = [firstRate, secondRate].filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return value;

  const min = Math.min(...rates);
  const max = Math.max(...rates);

  return Math.min(Math.max(value || min, min), max);
}

function getSuggestedReceiveAmounts(values: TransactionFormValues, transactionRate: number) {
  const paidCurrency = values.paidCurrency;
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const paidUsd = Number(values.paidUsd ?? 0);
  const paidVnd = Number(values.paidVnd ?? 0);

  if (paidCurrency === 'USD' && receivesUsd) return { receivedUsd: paidUsd };
  if (paidCurrency === 'VND' && !receivesUsd) return { receivedVnd: paidVnd };
  if (paidCurrency === 'USD' && !receivesUsd) return { receivedVnd: Math.round(paidUsd * transactionRate) };
  if (paidCurrency === 'VND' && receivesUsd && transactionRate > 0) return { receivedUsd: Number((paidVnd / transactionRate).toFixed(2)) };

  return {};
}

function formatVnd(value: number) {
  return formatBaseVnd(Math.round(value));
}

function TransactionSummary({ values }: Readonly<{ values: TransactionFormValues }>) {
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const paidUsd = Number(values.paidUsd ?? 0);
  const paidVnd = Number(values.paidVnd ?? 0);
  const appliedRate = Number(values.appliedPaidRate ?? (receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy));
  const transactionRate = Number(values.transactionRate ?? appliedRate);
  const impliedRate = Number(values.mgRate ?? getMgRate(values) ?? appliedRate);
  const suggestedReceive = getSuggestedReceiveAmounts(values, transactionRate);
  const receivedUsd = Number(values.receivedUsd ?? suggestedReceive.receivedUsd ?? 0);
  const receivedVnd = Number(values.receivedVnd ?? suggestedReceive.receivedVnd ?? 0);
  const paidLabel = values.paidCurrency === 'USD' ? formatUsd(paidUsd) : formatVnd(paidVnd);
  const receiveLabel = receivesUsd ? formatUsd(receivedUsd) : formatVnd(receivedVnd);

  return (
    <div className="mt-2 mb-4 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-black">Tóm tắt giao dịch</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Paid</div>
          <div className="text-3xl font-bold text-black">{paidLabel}</div>
          <div className="mt-1 text-xs text-slate-500">{values.paidCurrency ?? 'USD'}</div>
        </div>
        <div className="border-brand-100 text-center lg:border-x">
          <div className="mb-1 text-xs text-slate-500">Khách nhận</div>
          <div className="text-3xl font-bold text-black">{receiveLabel}</div>
          <div className="mt-1 text-xs text-slate-500">{receivesUsd ? 'USD' : 'VND'}</div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Tỷ giá giao dịch</div>
          <div className="text-3xl font-bold text-black">{formatExchangeRate(transactionRate)}</div>
          <div className="mt-1 text-xs text-slate-500">MG {formatExchangeRate(impliedRate)} · Applied {formatExchangeRate(appliedRate)}</div>
        </div>
      </div>
    </div>
  );
}

const columns: ColumnsType<TransactionRecord> = [
  { title: 'MSKH', dataIndex: 'customerCode', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'Paid USD', dataIndex: 'paidUsd', align: 'right', render: (value: number) => (value ? formatUsd(Number(value)) : '—') },
  { title: 'Paid VND', dataIndex: 'paidVnd', align: 'right', render: (value: number) => (value ? formatVnd(Number(value)) : '—') },
  { title: 'Receive USD', dataIndex: 'receivedUsd', align: 'right', render: (value: number) => (value ? formatUsd(Number(value)) : '—') },
  { title: 'Receive VND', dataIndex: 'receivedVnd', align: 'right', render: (value: number) => (value ? formatVnd(Number(value)) : '—') },
  { title: 'MG Implied', dataIndex: 'mgRate', align: 'right', render: (value: number, record) => formatExchangeRate(Number(value ?? (Number(record.paidVnd ?? record.receivedVnd ?? 0) / Number(record.paidUsd ?? record.receivedUsd ?? 1)))) },
  { title: 'Rate GD', dataIndex: 'transactionRate', align: 'right', render: (value: number, record) => formatExchangeRate(Number(value ?? record.appliedPaidRate ?? 0)) },
  { title: 'Applied', dataIndex: 'appliedPaidRate', align: 'right', render: (value: number, record) => formatExchangeRate(Number(value ?? (record.transactionType === 'RECEIVE_USD' ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy))) },
];

type MoneyGramTransactionsPageProps = {
  createOnly?: boolean;
  onCreated?: () => void;
};

export function MoneyGramTransactionsPage({ createOnly, onCreated }: MoneyGramTransactionsPageProps = {}) {
  return (
    <TransactionWorkspacePage
      title="Giao Dịch MoneyGram"
      description="Quản lý nhận USD/VND và các nghiệp vụ MoneyGram trả USD/VND theo ca."
      moduleName="moneygram"
      codePrefix="MG"
      createLabel="Tạo giao dịch MG"
      formIcon={<InboxOutlined className="text-brand-700" />}
      formSteps={['Reference', 'Khách hàng', 'Paid/Pay', 'Xác nhận']}
      summaryRenderer={(values) => <TransactionSummary values={values} />}
      fields={fields}
      columns={columns}
      initialRecords={moneyGramTransactionsMock}
      initialFormValues={initialFormValues}
      onFormValuesChange={handleValuesChange}
      transformFormValues={transformValues}
      createOnly={createOnly}
      onCreated={onCreated}
      formNotice={<Alert className="mb-4" type="info" showIcon message="MG chỉ cho nhập một loại Paid và một loại tiền khách nhận theo lựa chọn USD/VND." />}
    />
  );
}
