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
import { formatCurrency, formatNumber, formatUsd } from '@/shared/utils/formatters';
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
  { name: 'paidUsd', label: 'Amount USD', kind: 'number', required: true, span: 8, precision: 2, prefix: '$' },
  { name: 'paidVnd', label: 'Amount VND', kind: 'number', required: true, span: 8, prefix: '₫' },
  { name: 'wuRate', label: 'WU Implied Rate (auto)', kind: 'number', span: 8, readOnly: true, precision: 4 },
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
  if ('transactionType' in changedValues) {
    const receivesUsd = changedValues.transactionType === 'RECEIVE_USD';
    form.setFieldsValue({
      appliedPaidRate: receivesUsd ? activePaidRatesMock.paidSell : activePaidRatesMock.paidBuy,
      receivedUsd: receivesUsd ? allValues.receivedUsd : undefined,
      receivedVnd: receivesUsd ? undefined : allValues.receivedVnd,
    });
  }

  if ('paidUsd' in changedValues || 'paidVnd' in changedValues) {
    const paidUsd = Number(allValues.paidUsd ?? 0);
    const paidVnd = Number(allValues.paidVnd ?? 0);
    form.setFieldValue('wuRate', paidUsd > 0 && paidVnd > 0 ? paidVnd / paidUsd : undefined);
  }
}

function transformValues(values: TransactionFormValues): TransactionFormValues {
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const amount = Number(receivesUsd ? values.receivedUsd : values.receivedVnd);
  const appliedRate = Number(values.appliedPaidRate ?? 0);

  return {
    ...values,
    currency: receivesUsd ? 'USD' : 'VND',
    amount,
    vndAmount: receivesUsd ? amount * appliedRate : amount,
  };
}

function formatVnd(value: number) {
  return formatCurrency(Math.round(value));
}

function TransactionSummary({ values }: Readonly<{ values: TransactionFormValues }>) {
  const paidUsd = Number(values.paidUsd ?? 0);
  const paidVnd = Number(values.paidVnd ?? 0);
  const impliedRate = Number(values.wuRate ?? (paidUsd > 0 ? paidVnd / paidUsd : 0));
  const appliedRate = Number(values.appliedPaidRate ?? activePaidRatesMock.paidSell);
  const receivesUsd = values.transactionType === 'RECEIVE_USD';
  const receivedUsd = Number(values.receivedUsd ?? paidUsd);
  const receivedVnd = Number(values.receivedVnd ?? paidUsd * appliedRate);
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
          <div className="mt-1 text-xs text-slate-500">({formatNumber(impliedRate)} - {formatNumber(appliedRate)}) x {formatUsd(paidUsd)}</div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-500">Tác động quỹ</div>
          <div className="text-sm font-semibold text-teal-900">VND chi nhánh -{formatVnd(receivesUsd ? receivedUsd * appliedRate : receivedVnd)}</div>
          <div className="text-sm font-semibold text-teal-900">Công nợ WU USD +{formatUsd(paidUsd)}</div>
        </div>
      </div>
    </div>
  );
}

const columns: ColumnsType<TransactionRecord> = [
  { title: 'MSKH', dataIndex: 'customerCode' },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'USD', dataIndex: 'paidUsd', align: 'right', render: (value: number) => formatUsd(Number(value ?? 0)) },
  { title: 'VND', dataIndex: 'paidVnd', align: 'right', render: (value: number) => formatVnd(Number(value ?? 0)) },
  { title: 'Paid', dataIndex: 'paidCurrency', render: (value: string) => <Tag>{value}</Tag> },
  { title: 'Pay', dataIndex: 'transactionType', render: (value: string) => <Tag color={value === 'RECEIVE_VND' ? 'cyan' : 'default'}>{value === 'RECEIVE_USD' ? 'USD' : 'VND'}</Tag> },
  { title: 'Applied', dataIndex: 'appliedPaidRate', align: 'right', render: (value: number) => formatNumber(Number(value ?? 0)) },
  {
    title: 'Profit',
    key: 'profit',
    align: 'right',
    render: (_, record) => {
      const paidUsd = Number(record.paidUsd ?? 0);
      const implied = Number(record.wuRate ?? 0);
      const applied = Number(record.appliedPaidRate ?? 0);
      return <Typography.Text className="text-emerald-600!">{formatVnd((implied - applied) * paidUsd)}</Typography.Text>;
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
      formIcon={<SendOutlined className="text-teal-700" />}
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
