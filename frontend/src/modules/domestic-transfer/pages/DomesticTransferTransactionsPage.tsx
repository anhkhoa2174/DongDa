import { BankOutlined } from '@ant-design/icons';
import { Col, Row, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import {
  TransactionWorkspacePage,
  type TransactionField,
  type TransactionFormValues,
} from '@/modules/transactions/components/TransactionWorkspacePage';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';
import { useBranches } from '@/modules/western-union/hooks/useWu';
import { formatVnd } from '@/shared/utils/formatters';
import { domesticTransferTransactionsMock } from '../data/transactions.mock';

const TRANSACTION_TYPES = [
  { value: 'OUTGOING', label: 'Chuyển tiền đi' },
  { value: 'INCOMING', label: 'Nhận tiền' },
];

const columns: ColumnsType<TransactionRecord> = [
  {
    title: 'Loại GD',
    dataIndex: 'transactionType',
    render: (value: string) => <Tag color={value === 'OUTGOING' ? 'blue' : 'purple'}>{value === 'OUTGOING' ? 'Chuyển đi' : 'Nhận tiền'}</Tag>,
  },
  { title: 'Khách hàng', dataIndex: 'customerName', render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
  { title: 'Ngân hàng', dataIndex: 'bank' },
  { title: 'Số tài khoản', dataIndex: 'accountNumber' },
  { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (value: number) => formatVnd(Number(value)) },
  { title: 'Phí', dataIndex: 'fee', align: 'right', render: (value: number) => formatVnd(Number(value)) },
];

type DomesticTransferTransactionsPageProps = {
  createOnly?: boolean;
  onCreated?: () => void;
};

export function DomesticTransferTransactionsPage({ createOnly, onCreated }: DomesticTransferTransactionsPageProps = {}) {
  const user = useAuthStore((state) => state.user);
  const { data: branches = [] } = useBranches();
  const isBranchUser = user?.role === 'branch';
  const isControlUser = user?.role === 'director' || user?.role === 'accountant';
  const branchOptions = useMemo(
    () => branches
      .filter((branch) => branch.type !== 'HEAD_OFFICE')
      .filter((branch) => !isBranchUser || branch.id === user?.branchId)
      .map((branch) => ({ value: branch.id, label: `${branch.code} — ${branch.name}` })),
    [branches, isBranchUser, user?.branchId],
  );
  const fields = useMemo<TransactionField[]>(() => [
    {
      name: 'transactionType', label: 'Loại giao dịch', kind: 'segmented', required: true,
      options: TRANSACTION_TYPES, span: 12,
    },
    {
      name: 'branchId', label: 'Chi nhánh', kind: 'select', required: true,
      placeholder: 'Chọn chi nhánh thực hiện', options: branchOptions, readOnly: isBranchUser, span: 12,
    },
    { name: 'customerName', label: 'Tên khách hàng', kind: 'text', required: true, span: 12, maxLength: 150 },
    {
      name: 'phone', label: 'Số điện thoại (không bắt buộc)', kind: 'text', span: 12,
      maxLength: 11, pattern: /^0\d{9,10}$/, patternMessage: 'Số điện thoại phải gồm 10-11 chữ số và bắt đầu bằng 0',
    },
    { name: 'bank', label: 'Ngân hàng (không bắt buộc)', kind: 'text', span: 12, maxLength: 100 },
    { name: 'accountNumber', label: 'Số tài khoản (không bắt buộc)', kind: 'text', span: 12, maxLength: 30 },
    {
      name: 'amount', label: 'Số tiền giao dịch', kind: 'number', required: true,
      min: 0, positive: true, precision: 0, inputFormat: 'vnd', prefix: 'VND', span: 12,
    },
    {
      name: 'fee', label: 'Phí giao dịch', kind: 'number', min: 0,
      precision: 0, inputFormat: 'vnd', prefix: 'VND', span: 12,
    },
  ], [branchOptions, isBranchUser]);

  const summaryRenderer = (values: TransactionFormValues) => {
    const type = values.transactionType ?? 'OUTGOING';
    const amount = Number(values.amount ?? 0);
    const fee = Number(values.fee ?? 0);
    const settlement = type === 'OUTGOING' ? amount + fee : Math.max(amount - fee, 0);
    const selectedBranch = branches.find((branch) => branch.id === values.branchId);

    return (
      <div className="mb-4 border-y border-slate-200 bg-slate-50 px-4 py-3">
        <Typography.Text strong>Tóm tắt giao dịch</Typography.Text>
        <Row gutter={[16, 12]} className="mt-3">
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Nghiệp vụ</Typography.Text>
            <div className="mt-1 font-semibold text-slate-900">
              {type === 'OUTGOING' ? 'Chuyển tiền đi' : 'Nhận tiền'}
            </div>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Chi nhánh</Typography.Text>
            <div className="mt-1 font-semibold text-slate-900">
              {selectedBranch?.code ?? user?.branchName ?? '-'}
            </div>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Số tiền / Phí</Typography.Text>
            <div className="mt-1 font-semibold text-slate-900">{formatVnd(amount)}</div>
            <Typography.Text type="secondary" className="text-xs!">Phí {formatVnd(fee)}</Typography.Text>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">
              {type === 'OUTGOING' ? 'Khách thanh toán' : 'Khách nhận'}
            </Typography.Text>
            <div className="mt-1 text-lg font-semibold text-brand-700">{formatVnd(settlement)}</div>
          </Col>
        </Row>
      </div>
    );
  };

  return (
    <TransactionWorkspacePage
      title="Chuyển Tiền Nội Địa"
      description="Quản lý chuyển tiền đi, nhận tiền và phí giao dịch theo ca làm việc."
      moduleName="domestic-transfer"
      codePrefix="DT"
      createLabel="Tạo giao dịch chuyển tiền"
      fields={fields}
      columns={columns}
      initialRecords={domesticTransferTransactionsMock}
      createOnly={createOnly}
      showHistory={false}
      showBackButton
      showShiftHeader={false}
      formIcon={<BankOutlined />}
      formSteps={['Chọn chi nhánh', 'Nhập giao dịch', 'Xác nhận']}
      initialFormValues={{
        branchId: isBranchUser ? user?.branchId : undefined,
        transactionType: 'OUTGOING',
        amount: 0,
        fee: 0,
      }}
      transformFormValues={(values) => {
        const transactionType = values.transactionType ?? 'OUTGOING';
        const amount = Number(values.amount ?? 0);
        const fee = Number(values.fee ?? 0);
        return {
          ...values,
          branchId: isBranchUser && user?.branchId ? user.branchId : values.branchId,
          amount,
          fee,
          vndAmount: transactionType === 'OUTGOING' ? amount + fee : Math.max(amount - fee, 0),
        };
      }}
      summaryRenderer={summaryRenderer}
      canCreateOverride={isControlUser ? true : undefined}
      onCreated={onCreated}
    />
  );
}
