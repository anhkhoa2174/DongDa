import { Alert, Tag, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
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
import { formatExchangeRate, formatUsd, formatVnd as formatBaseVnd, formatWuMtcn } from '@/shared/utils/formatters';
import { westernUnionTransactionsMock } from '../data/transactions.mock';

const bankOptions = Array.from(new Map(
  bankAccountsMock.map((account) => [
    account.bankCode,
    { value: account.bankCode, label: `${account.bankCode} - ${account.bankName}` },
  ]),
).values());

const fields: TransactionField[] = [
  { name: 'customerCode', label: 'MSKH (WU MTCN)', kind: 'text', required: true, span: 8, maxLength: 10, pattern: /^\d{10}$/, patternMessage: 'MSKH Western Union phải gồm đúng 10 chữ số', placeholder: 'Nhập đúng 10 số' },
  { name: 'customerName', label: 'Tên khách hàng', kind: 'text', required: true, span: 8 },
  { name: 'phone', label: 'Số điện thoại (optional)', kind: 'text', span: 8 },
  { name: 'paidUsd', label: 'Amount USD', kind: 'number', required: true, positive: true, span: 8, precision: 2, prefix: '$' },
  { name: 'paidVnd', label: 'Amount VND', kind: 'number', required: true, positive: true, span: 8, prefix: '₫' },
  { name: 'wuRate', label: 'WU Implied Rate (auto)', kind: 'number', span: 8, readOnly: true, precision: 4 },
  { name: 'receivedUsd', label: 'Receive USD chẵn', kind: 'number', required: true, span: 8, precision: 0, prefix: '$' },
  { name: 'receivedVnd', label: 'Receive VND phần lẻ', kind: 'number', required: true, span: 8, prefix: '₫' },
  {
    name: 'transactionRate',
    label: 'Tỷ giá giao dịch',
    kind: 'slider',
    span: 8,
    precision: 2,
    positive: true,
    step: 50,
    rangeMinField: 'wuRate',
    rangeMaxField: 'appliedPaidRate',
  },
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
    options: [
      { value: 'RECEIVE_USD', label: 'USD' },
      { value: 'RECEIVE_VND', label: 'VND' },
    ],
  },
  { name: 'appliedPaidRate', label: 'Applied Rate', kind: 'number', span: 8, readOnly: true },
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
  const paidUsd = Number(allValues.paidUsd ?? 0);
  const paidVnd = Number(allValues.paidVnd ?? 0);
  const nextWuRate = paidUsd > 0 && paidVnd > 0 ? paidVnd / paidUsd : undefined;

  if ('transactionType' in changedValues) {
    const receivesUsd = changedValues.transactionType === 'RECEIVE_USD';
    const nextAppliedRate = receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy;
    const nextTransactionRate = clampRate(
      Number(allValues.transactionRate ?? nextAppliedRate),
      nextWuRate,
      nextAppliedRate,
    );
    const receiveAmounts = getDefaultReceiveAmounts(
      receivesUsd,
      paidUsd,
      paidVnd,
      nextTransactionRate,
    );

    form.setFieldsValue({
      appliedPaidRate: nextAppliedRate,
      transactionRate: nextTransactionRate,
      ...receiveAmounts,
    });
  }

  if ('paidUsd' in changedValues || 'paidVnd' in changedValues) {
    const appliedRate = Number(allValues.appliedPaidRate ?? activePaidRatesMock.paidSell);
    const transactionRate = clampRate(
      Number(allValues.transactionRate ?? appliedRate),
      nextWuRate,
      appliedRate,
    );
    const receiveAmounts = getDefaultReceiveAmounts(
      allValues.transactionType !== 'RECEIVE_VND',
      paidUsd,
      paidVnd,
      transactionRate,
    );

    form.setFieldsValue({
      wuRate: nextWuRate,
      transactionRate,
      ...receiveAmounts,
    });
  }

  if ('transactionRate' in changedValues) {
    const receivesUsd = allValues.transactionType !== 'RECEIVE_VND';
    const transactionRate = Number(allValues.transactionRate ?? allValues.appliedPaidRate ?? 0);

    if (receivesUsd && transactionRate > 0) {
      form.setFieldsValue(splitUsdPayout(paidUsd, transactionRate));
    }
  }
}

function transformValues(values: TransactionFormValues): TransactionFormValues {
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const amount = Number(receivesUsd ? values.receivedUsd : values.receivedVnd);
  const transactionRate = Number(values.transactionRate ?? values.appliedPaidRate ?? 0);
  const receivedUsd = Number(values.receivedUsd ?? 0);
  const receivedVnd = Number(values.receivedVnd ?? 0);
  const payoutVndEquivalent = receivesUsd ? receivedUsd * transactionRate + receivedVnd : amount;

  return {
    ...values,
    currency: receivesUsd ? 'USD' : 'VND',
    amount,
    vndAmount: payoutVndEquivalent,
    payoutVndEquivalent,
    payoutVndCash: receivesUsd ? receivedVnd : amount,
    payoutUsdCash: receivesUsd ? receivedUsd : 0,
  };
}

function getDefaultReceiveAmounts(
  receivesUsd: boolean,
  paidUsd: number,
  paidVnd: number,
  transactionRate: number,
) {
  if (receivesUsd) return splitUsdPayout(paidUsd, transactionRate);

  return {
    receivedUsd: 0,
    receivedVnd: paidVnd,
  };
}

function clampRate(value: number, firstRate?: number, secondRate?: number) {
  const rates = [firstRate, secondRate].filter((rate): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0);
  if (rates.length === 0) return value;

  const min = Math.min(...rates);
  const max = Math.max(...rates);

  return Math.min(Math.max(value || min, min), max);
}

function splitUsdPayout(usdAmount: number, transactionRate: number) {
  const receivedUsd = Math.trunc(Math.max(usdAmount, 0));
  const fractionalUsd = Math.max(usdAmount - receivedUsd, 0);

  return {
    receivedUsd,
    receivedVnd: Math.round(fractionalUsd * transactionRate),
  };
}

function formatVnd(value: number) {
  return formatBaseVnd(Math.round(value));
}

function TransactionSummary({ values }: Readonly<{ values: TransactionFormValues }>) {
  const paidUsd = Number(values.paidUsd ?? 0);
  const paidVnd = Number(values.paidVnd ?? 0);
  const impliedRate = Number(values.wuRate ?? (paidUsd > 0 ? paidVnd / paidUsd : 0));
  const appliedRate = Number(values.appliedPaidRate ?? activePaidRatesMock.paidSell);
  const transactionRate = Number(values.transactionRate ?? appliedRate);
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const defaultReceiveAmounts = getDefaultReceiveAmounts(receivesUsd, paidUsd, paidVnd, transactionRate);
  const receivedUsd = Number(values.receivedUsd ?? defaultReceiveAmounts.receivedUsd);
  const receivedVnd = Number(values.receivedVnd ?? defaultReceiveAmounts.receivedVnd);
  const fractionalUsd = receivesUsd ? Math.max(paidUsd - receivedUsd, 0) : 0;
  const payoutVndEquivalent = receivesUsd ? receivedUsd * transactionRate + receivedVnd : receivedVnd;

  return (
    <div className="mt-2 mb-4 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-5 shadow-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-black">Tóm tắt giao dịch</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Khách nhận</div>
          <div className="text-3xl font-bold text-black">{receivesUsd ? `${formatUsd(receivedUsd, 0)} + ${formatVnd(receivedVnd)}` : formatVnd(receivedVnd)}</div>
          <div className="mt-1 text-xs text-slate-500">Rate GD {formatExchangeRate(transactionRate)} · Applied {formatExchangeRate(appliedRate)}</div>
        </div>
        <div className="border-brand-100 text-center lg:border-x">
          <div className="mb-1 text-xs text-slate-500">Tỷ giá giao dịch</div>
          <div className="text-3xl font-bold text-black">{formatExchangeRate(transactionRate)}</div>
          <div className="mt-1 text-xs text-slate-500">{receivesUsd ? `USD lẻ ${formatUsd(fractionalUsd)} → ${formatVnd(receivedVnd)}` : `WU ${formatExchangeRate(impliedRate)}`}</div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Quy đổi giao dịch</div>
          <div className="text-3xl font-bold text-black">{formatVnd(payoutVndEquivalent)}</div>
          <div className="mt-1 text-xs text-slate-500">USD -{formatUsd(receivedUsd, 0)} · VND -{formatVnd(receivedVnd)}</div>
        </div>
      </div>
    </div>
  );
}

const columns: ColumnsType<TransactionRecord> = [
  { title: 'MSKH', dataIndex: 'customerCode', render: (value: string) => formatWuMtcn(value) },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'USD', dataIndex: 'paidUsd', align: 'right', render: (value: number) => formatUsd(Number(value ?? 0)) },
  { title: 'VND', dataIndex: 'paidVnd', align: 'right', render: (value: number) => formatVnd(Number(value ?? 0)) },
  { title: 'Paid', dataIndex: 'paidCurrency', render: (value: string) => <Tag>{value}</Tag> },
  { title: 'Pay', dataIndex: 'transactionType', render: (value: string) => <Tag color={value === 'RECEIVE_VND' ? 'cyan' : 'default'}>{value === 'RECEIVE_USD' ? 'USD' : 'VND'}</Tag> },
  { title: 'Receive USD', dataIndex: 'receivedUsd', align: 'right', render: (value: number) => formatUsd(Number(value ?? 0)) },
  { title: 'Receive VND', dataIndex: 'receivedVnd', align: 'right', render: (value: number) => formatVnd(Number(value ?? 0)) },
  { title: 'Rate GD', dataIndex: 'transactionRate', align: 'right', render: (value: number) => formatExchangeRate(Number(value ?? 0)) },
  { title: 'Applied', dataIndex: 'appliedPaidRate', align: 'right', render: (value: number) => formatExchangeRate(Number(value ?? 0)) },
  {
    title: 'Profit',
    key: 'profit',
    align: 'right',
    render: (_, record) => {
      const paidVnd = Number(record.paidVnd ?? 0);
      const receivedUsd = Number(record.receivedUsd ?? 0);
      const receivedVnd = Number(record.receivedVnd ?? 0);
      const transactionRate = Number(record.transactionRate ?? record.appliedPaidRate ?? 0);
      const payoutVndEquivalent = record.transactionType === 'RECEIVE_USD'
        ? receivedUsd * transactionRate + receivedVnd
        : receivedVnd;

      return <Typography.Text className="text-emerald-600!">{formatVnd(paidVnd - payoutVndEquivalent)}</Typography.Text>;
    },
  },
];

type WesternUnionTransactionsPageProps = {
  createOnly?: boolean;
  onCreated?: () => void;
};

export function WesternUnionTransactionsPage({ createOnly, onCreated }: WesternUnionTransactionsPageProps = {}) {
  return (
    <TransactionWorkspacePage
      title="Giao Dịch Western Union"
      description="Quản lý giao dịch khách nhận USD/VND; mọi giao dịch bắt buộc thuộc một ca làm việc."
      moduleName="western-union"
      codePrefix="WU"
      createLabel="Tạo giao dịch WU"
      formIcon={<SendOutlined className="text-brand-700" />}
      formSteps={['MSKH', 'Khách hàng', 'Paid/Pay', 'Xác nhận']}
      summaryRenderer={(values) => <TransactionSummary values={values} />}
      fields={fields}
      columns={columns}
      initialRecords={westernUnionTransactionsMock}
      initialFormValues={initialFormValues}
      onFormValuesChange={handleValuesChange}
      transformFormValues={transformValues}
      createOnly={createOnly}
      onCreated={onCreated}
      formNotice={<Alert className="mb-4" type="info" showIcon message="WU: nhập cả Paid USD và Paid VND để tự tính tỷ giá WU. Tỷ giá Paid áp dụng cho khách nhận là tỷ giá active và không thể sửa." />}
    />
  );
}
