import { BankOutlined, DownloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Col, Row, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import {
  TransactionWorkspacePage,
  type TransactionField,
  type TransactionFormValues,
} from '@/modules/transactions/components/TransactionWorkspacePage';
import type { TransactionRecord } from '@/modules/transactions/model/transaction.types';
import { useBranches } from '@/shared/hooks/useBranches';
import { formatVnd } from '@/shared/utils/formatters';
import { domesticTransferApi } from '../api/domesticTransfer.api';
import type { CreateDomesticTransferPayload, DomesticTransferType } from '../api/domesticTransfer.api';

const TRANSACTION_TYPES = [
  { value: 'CASH_TO_BANK', label: 'Nhận tiền mặt, chuyển khoản' },
  { value: 'BANK_TO_CASH', label: 'Nhận chuyển khoản, trả tiền mặt' },
];

const columns: ColumnsType<TransactionRecord> = [
  {
    title: 'Loại GD',
    dataIndex: 'transactionType',
    render: (value: string) => (
      <Tag color={value === 'CASH_TO_BANK' ? 'gold' : 'blue'}>
        {value === 'CASH_TO_BANK' ? 'Tiền mặt → Chuyển khoản' : 'Chuyển khoản → Tiền mặt'}
      </Tag>
    ),
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
  const { message } = App.useApp();
  const [isExporting, setIsExporting] = useState(false);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const { data: branches = [] } = useBranches();
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['domestic-transfers', 'bank-accounts'],
    queryFn: domesticTransferApi.bankAccounts,
  });
  const isBranchUser = user?.role === 'branch';
  const isControlUser = user?.role === 'director' || user?.role === 'accountant';
  const branchOptions = useMemo(
    () => branches
      .filter((branch) => branch.type !== 'HEAD_OFFICE')
      .filter((branch) => !isBranchUser || branch.id === user?.branchId)
      .map((branch) => ({ value: branch.id, label: `${branch.code} — ${branch.name}` })),
    [branches, isBranchUser, user?.branchId],
  );
  const bankAccountOptions = useMemo(
    () => bankAccounts.map((account) => ({
      value: account.id,
      label: `${account.bankCode} - ${account.accountNo} · Số dư ${formatVnd(account.currentBalance)}`,
    })),
    [bankAccounts],
  );
  const fields = useMemo<TransactionField[]>(() => [
    {
      name: 'transactionType', label: 'Loại giao dịch', kind: 'segmented', required: true,
      options: TRANSACTION_TYPES, span: 24,
    },
    {
      name: 'branchId', label: 'Chi nhánh', kind: 'select', required: true,
      placeholder: 'Chọn chi nhánh thực hiện', options: branchOptions, readOnly: isBranchUser, span: 12,
    },
    {
      name: 'bankAccountId', label: 'Tài khoản ngân hàng công ty', kind: 'select', required: true,
      placeholder: 'Chọn tài khoản nhận/chuyển tiền', options: bankAccountOptions, span: 12,
    },
    { name: 'customerName', label: 'Họ tên chủ tài khoản', kind: 'text', required: true, span: 12, maxLength: 150 },
    {
      name: 'customerPhone', label: 'Số điện thoại người gửi (không bắt buộc)', kind: 'text', span: 12,
      maxLength: 11, pattern: /^0\d{9,10}$/, patternMessage: 'Số điện thoại phải gồm 10-11 chữ số và bắt đầu bằng 0',
    },
    { name: 'counterpartyBank', label: 'Ngân hàng', kind: 'text', required: true, span: 12, maxLength: 150 },
    { name: 'counterpartyAccount', label: 'Số tài khoản', kind: 'text', required: true, span: 12, maxLength: 100 },
    {
      name: 'amount', label: 'Số tiền giao dịch', kind: 'number', required: true,
      min: 0, positive: true, precision: 0, inputFormat: 'vnd', suffix: 'VND', span: 12,
      placeholder: 'Ví dụ: 1,000,000',
    },
    {
      name: 'fee', label: 'Phí giao dịch', kind: 'number', min: 0,
      precision: 0, inputFormat: 'vnd', suffix: 'VND', span: 12,
      placeholder: 'Ví dụ: 10,000',
    },
    { name: 'transferNote', label: 'Nội dung chuyển tiền', kind: 'text', required: true, span: 16, maxLength: 500 },
    { name: 'transferReference', label: 'Giao dịch số', kind: 'text', required: true, span: 8, maxLength: 100 },
  ], [bankAccountOptions, branchOptions, isBranchUser]);

  const summaryRenderer = (values: TransactionFormValues) => {
    const type = (values.transactionType ?? 'CASH_TO_BANK') as DomesticTransferType;
    const amount = Number(values.amount ?? 0);
    const fee = Number(values.fee ?? 0);
    const cashAmount = type === 'CASH_TO_BANK' ? amount + fee : Math.max(amount - fee, 0);
    const selectedBranch = branches.find((branch) => branch.id === values.branchId);
    const selectedBank = bankAccounts.find((account) => account.id === values.bankAccountId);

    return (
      <div className="mb-4 border-y border-slate-200 bg-slate-50 px-4 py-3">
        <Typography.Text strong>Tóm tắt giao dịch</Typography.Text>
        {type === 'CASH_TO_BANK' && (
          <Alert
            className="mt-3"
            type="info"
            showIcon
            message="Hệ thống sẽ tự động ghi nhận ứng chuyển khoản"
            description="Khoản chuyển ra được theo dõi tại Ngân hàng cho đến khi KTTH/GĐ hoàn ứng."
          />
        )}
        <Row gutter={[16, 12]} className="mt-3">
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Nghiệp vụ</Typography.Text>
            <div className="mt-1 font-semibold text-slate-900">
              {type === 'CASH_TO_BANK' ? 'Nhận tiền mặt, chuyển khoản' : 'Nhận chuyển khoản, trả tiền mặt'}
            </div>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Chi nhánh</Typography.Text>
            <div className="mt-1 font-semibold text-slate-900">
              {selectedBranch?.code ?? user?.branchName ?? '-'}
            </div>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">Chuyển khoản</Typography.Text>
            <div className="mt-1 font-semibold text-slate-900">{formatVnd(amount)}</div>
            <Typography.Text type="secondary" className="text-xs!">
              {selectedBank ? `${selectedBank.bankCode} - ${selectedBank.accountNo}` : 'Chưa chọn tài khoản'}
            </Typography.Text>
          </Col>
          <Col xs={12} md={6}>
            <Typography.Text type="secondary">
              {type === 'CASH_TO_BANK' ? 'Tiền mặt nhận vào' : 'Tiền mặt trả ra'}
            </Typography.Text>
            <div className="mt-1 text-lg font-semibold text-brand-700">{formatVnd(cashAmount)}</div>
            <Typography.Text type="secondary" className="text-xs!">Đã gồm phí {formatVnd(fee)}</Typography.Text>
          </Col>
        </Row>
      </div>
    );
  };

  return (
    <TransactionWorkspacePage
      title="Giao Dịch Chuyển Tiền"
      description="Nhận tiền mặt để chuyển khoản hoặc nhận chuyển khoản để trả tiền mặt tại chi nhánh."
      moduleName="domestic-transfer"
      codePrefix="DT"
      createLabel="Tạo giao dịch chuyển tiền"
      fields={fields}
      columns={columns}
      initialRecords={[]}
      formNotice={bankAccounts.length === 0 ? (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message="Chưa có tài khoản ngân hàng VND"
          description="Cần khởi tạo ít nhất một tài khoản ngân hàng công ty trước khi tạo giao dịch chuyển tiền."
        />
      ) : undefined}
      createOnly={createOnly}
      showHistory={false}
      showBackButton
      showShiftHeader={false}
      formIcon={<BankOutlined />}
      formSteps={['Chọn nghiệp vụ', 'Chọn nguồn tiền', 'Nhập số tiền', 'Xác nhận']}
      initialFormValues={{
        branchId: isBranchUser ? user?.branchId : undefined,
        transactionType: 'CASH_TO_BANK',
        amount: 0,
        fee: 0,
      }}
      transformFormValues={(values) => {
        const amount = Number(values.amount ?? 0);
        const fee = Number(values.fee ?? 0);
        return {
          ...values,
          branchId: isBranchUser && user?.branchId ? user.branchId : values.branchId,
          amount,
          fee,
          vndAmount: amount,
        };
      }}
      createTransaction={async (values) => {
        const payload: CreateDomesticTransferPayload = {
          branchId: String(values.branchId),
          transferType: values.transactionType as DomesticTransferType,
          bankAccountId: String(values.bankAccountId),
          customerName: values.customerName ? String(values.customerName) : undefined,
          customerPhone: values.customerPhone ? String(values.customerPhone) : undefined,
          counterpartyBank: values.counterpartyBank ? String(values.counterpartyBank) : undefined,
          counterpartyAccount: values.counterpartyAccount ? String(values.counterpartyAccount) : undefined,
          transferReference: String(values.transferReference),
          amount: Number(values.amount),
          fee: Number(values.fee ?? 0),
          transferNote: values.transferNote ? String(values.transferNote) : undefined,
        };
        await domesticTransferApi.create(payload);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['domestic-transfers'] }),
          queryClient.invalidateQueries({ queryKey: ['fund'] }),
          queryClient.invalidateQueries({ queryKey: ['bank'] }),
          queryClient.invalidateQueries({ queryKey: ['summary'] }),
        ]);
      }}
      summaryRenderer={summaryRenderer}
      createFormActions={(form) => (
        <Button
          icon={<DownloadOutlined />}
          loading={isExporting}
          onClick={async () => {
            try {
              const values = await form.validateFields();
              setIsExporting(true);
              const payload = toDomesticTransferPayload(values, isBranchUser && user?.branchId ? user.branchId : undefined);
              const blob = await domesticTransferApi.exportForm(payload);
              downloadBlob(blob, `GIAY-CHUYEN-KHOAN-${payload.transferReference}.xlsx`);
              message.success('Đã xuất giấy chuyển khoản');
            } catch (error: unknown) {
              if (error && typeof error === 'object' && 'errorFields' in error) return;
              message.error('Không thể xuất giấy chuyển khoản');
            } finally {
              setIsExporting(false);
            }
          }}
        >
          Xuất giấy chuyển khoản
        </Button>
      )}
      canCreateOverride={bankAccounts.length === 0 ? false : isControlUser ? true : undefined}
      onCreated={onCreated}
    />
  );
}

function toDomesticTransferPayload(values: TransactionFormValues, branchId?: string): CreateDomesticTransferPayload {
  return {
    branchId: branchId ?? String(values.branchId),
    transferType: values.transactionType as DomesticTransferType,
    bankAccountId: String(values.bankAccountId),
    customerName: String(values.customerName),
    customerPhone: values.customerPhone ? String(values.customerPhone) : undefined,
    counterpartyBank: String(values.counterpartyBank),
    counterpartyAccount: String(values.counterpartyAccount),
    transferReference: String(values.transferReference),
    amount: Number(values.amount),
    fee: Number(values.fee ?? 0),
    transferNote: String(values.transferNote),
  };
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
