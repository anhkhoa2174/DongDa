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
import { formatCurrency, formatNumber, formatUsd } from '@/shared/utils/formatters';
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
  { name: 'customerCode', label: 'Reference No.', kind: 'text', required: true, span: 8, maxLength: 8, pattern: /^\d{8}$/, patternMessage: 'Reference MoneyGram phải gồm đúng 8 chữ số', placeholder: 'Nhập đúng 8 số' },
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
    disabledWhen: (values) => values.paidCurrency !== 'USD',
  },
  {
    name: 'paidVnd',
    label: 'Amount VND',
    kind: 'number',
    required: true,
    span: 8,
    prefix: '₫',
    disabledWhen: (values) => values.paidCurrency !== 'VND',
  },
  { name: 'mgRate', label: 'MG Implied Rate (auto)', kind: 'number', span: 8, readOnly: true, precision: 4 },
  {
    name: 'receivedUsd',
    label: 'Khách nhận USD',
    kind: 'number',
    required: true,
    span: 8,
    precision: 2,
    prefix: '$',
    disabledWhen: (values) => values.transactionType !== 'RECEIVE_USD',
  },
  {
    name: 'receivedVnd',
    label: 'Khách nhận VND',
    kind: 'number',
    required: true,
    span: 8,
    prefix: '₫',
    disabledWhen: (values) => values.transactionType !== 'RECEIVE_VND',
  },
  { name: 'bank', label: 'Ngân hàng', kind: 'select', span: 8, placeholder: 'Chọn ngân hàng đang dùng', options: bankOptions },
];

const initialFormValues: TransactionFormValues = {
  transactionType: 'RECEIVE_USD',
  paidCurrency: 'USD',
  appliedPaidRate: activePaidRatesMock.paidSell,
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
    form.setFieldsValue({
      appliedPaidRate: receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy,
      receivedUsd: receivesUsd ? allValues.receivedUsd : undefined,
      receivedVnd: receivesUsd ? undefined : allValues.receivedVnd,
    });
  }

  if (['paidUsd', 'paidVnd', 'receivedUsd', 'receivedVnd', 'paidCurrency', 'transactionType'].some((key) => key in changedValues)) {
    const paidUsd = Number(allValues.paidUsd ?? allValues.receivedUsd ?? 0);
    const paidVnd = Number(allValues.paidVnd ?? allValues.receivedVnd ?? 0);
    form.setFieldValue('mgRate', paidUsd > 0 && paidVnd > 0 ? paidVnd / paidUsd : undefined);
  }
}

function transformValues(values: TransactionFormValues): TransactionFormValues {
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const amount = Number(receivesUsd ? values.receivedUsd : values.receivedVnd);

  return {
    ...values,
    appliedPaidRate: values.appliedPaidRate ?? (receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy),
    currency: receivesUsd ? 'USD' : 'VND',
    amount,
    vndAmount: receivesUsd
      ? Number(values.paidVnd ?? 0) || amount * activePaidRatesMock.paidSell
      : amount,
  };
}

function formatVnd(value: number) {
  return formatCurrency(Math.round(value));
}

function TransactionSummary({ values }: Readonly<{ values: TransactionFormValues }>) {
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const paidUsd = Number(values.paidUsd ?? values.receivedUsd ?? 0);
  const paidVnd = Number(values.paidVnd ?? values.receivedVnd ?? 0);
  const appliedRate = Number(values.appliedPaidRate ?? (receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy));
  const impliedRate = Number(values.mgRate ?? (paidUsd > 0 && paidVnd > 0 ? paidVnd / paidUsd : appliedRate));
  const receivedUsd = Number(values.receivedUsd ?? paidUsd);
  const receivedVnd = Number(values.receivedVnd ?? paidVnd);
  const profit = paidUsd > 0 ? (impliedRate - appliedRate) * paidUsd : 0;

  return (
    <div className="mt-2 mb-4 rounded-lg border border-teal-200 bg-teal-50 p-5">
      <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-teal-700">Tóm tắt giao dịch</div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Khách nhận</div>
          <div className="text-3xl font-bold text-teal-900">{receivesUsd ? formatUsd(receivedUsd) : formatVnd(receivedVnd)}</div>
          <div className="mt-1 text-xs text-slate-500">Applied {formatNumber(appliedRate)}</div>
        </div>
        <div className="border-teal-200 text-center lg:border-x">
          <div className="mb-1 text-xs text-slate-500">Lợi nhuận TG dự kiến</div>
          <div className="text-3xl font-bold text-emerald-600">{formatVnd(profit)}</div>
          <div className="mt-1 text-xs text-slate-500">MG implied {formatNumber(impliedRate)}</div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Tác động quỹ</div>
          <div className="text-sm font-semibold text-teal-900">{receivesUsd ? `USD chi nhánh -${formatUsd(receivedUsd)}` : `VND chi nhánh -${formatVnd(receivedVnd)}`}</div>
          <div className="text-sm font-semibold text-teal-900">Công nợ MG USD +{formatUsd(paidUsd)}</div>
        </div>
      </div>
    </div>
  );
}

const columns: ColumnsType<TransactionRecord> = [
  { title: 'Reference No.', dataIndex: 'customerCode' },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'USD', dataIndex: 'paidUsd', align: 'right', render: (value: number, record) => formatUsd(Number(value ?? record.receivedUsd ?? 0)) },
  { title: 'VND', dataIndex: 'paidVnd', align: 'right', render: (value: number, record) => formatVnd(Number(value ?? record.receivedVnd ?? 0)) },
  { title: 'MG Implied', dataIndex: 'mgRate', align: 'right', render: (value: number, record) => formatNumber(Number(value ?? (Number(record.paidVnd ?? record.receivedVnd ?? 0) / Number(record.paidUsd ?? record.receivedUsd ?? 1)))) },
  { title: 'Applied', dataIndex: 'appliedPaidRate', align: 'right', render: (value: number, record) => formatNumber(Number(value ?? (record.transactionType === 'RECEIVE_USD' ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy))) },
  {
    title: 'Profit',
    key: 'profit',
    align: 'right',
    render: (_, record) => {
      const paidUsd = Number(record.paidUsd ?? record.receivedUsd ?? 0);
      const implied = Number(record.mgRate ?? (Number(record.paidVnd ?? record.receivedVnd ?? 0) / Math.max(paidUsd, 1)));
      const applied = Number(record.appliedPaidRate ?? (record.transactionType === 'RECEIVE_USD' ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy));
      return <Typography.Text className="text-emerald-600!">{formatVnd((implied - applied) * paidUsd)}</Typography.Text>;
    },
  },
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
      formIcon={<InboxOutlined className="text-teal-700" />}
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
