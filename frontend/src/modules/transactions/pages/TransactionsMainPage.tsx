import {
  BankOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  FieldTimeOutlined,
  FileDoneOutlined,
  InboxOutlined,
  ReloadOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { DATE_INPUT_FORMAT, DATE_RANGE_PLACEHOLDERS } from '@/shared/utils/datePicker';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { getApiErrorMessage } from '@/shared/utils/errors';
import {
  formatDateTime,
  formatExchangeRate,
  formatUsd,
  formatVnd,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { isUiTestMode } from '@/shared/config/runtime';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBranches } from '@/shared/hooks/useBranches';
import { useWuTransactions } from '@/modules/western-union/hooks/useWu';
import { useMgTransactions } from '@/modules/moneygram/hooks/useMg';
import { useFxTransactions } from '@/modules/foreign-exchange/hooks/useFx';
import { domesticTransferApi } from '@/modules/domestic-transfer/api/domesticTransfer.api';
import { transactionAdminApi } from '../api/transactionAdmin.api';
import type { TransactionAdjustmentRequest } from '../api/transactionAdmin.api';
import { useTransactionShift } from '../hooks/useTransactionShift';
import { getTransactionAccess } from '../model/transactionAccess';
import type { AggregatedTransaction, TransactionSource, TransactionStatus } from '../model/transaction.types';

const sourceMeta: Record<TransactionSource, { label: string; color: string }> = {
  WU: { label: 'Western Union', color: 'blue' },
  MG: { label: 'MoneyGram', color: 'cyan' },
  FX: { label: 'Ngoại tệ', color: 'green' },
  DOMESTIC: { label: 'Chuyển tiền', color: 'purple' },
};

const statusMeta: Record<TransactionStatus, { label: string; color: string }> = {
  COMPLETED: { label: 'Hoàn tất', color: 'green' },
  PENDING: { label: 'Chờ xử lý', color: 'gold' },
  VOID: { label: 'Đã void', color: 'red' },
  VOIDED: { label: 'Đã deactive', color: 'red' },
  DEACTIVATED: { label: 'Đã deactive', color: 'red' },
  ADJUSTED: { label: 'Đã điều chỉnh', color: 'blue' },
};

function normalizeTransactionStatus(status?: string): TransactionStatus {
  if (status && status in statusMeta) return status as TransactionStatus;
  return 'COMPLETED';
}

const createActions = [
  { key: 'WU', label: 'Tạo WU', icon: <SendOutlined />, path: '/western-union/workspace' },
  { key: 'MG', label: 'Tạo MG', icon: <InboxOutlined />, path: '/moneygram/workspace' },
  { key: 'FX', label: 'Mua/Bán ngoại tệ', icon: <SwapOutlined />, path: '/foreign-exchange/workspace' },
  { key: 'DOMESTIC', label: 'Chuyển tiền', icon: <BankOutlined />, path: '/domestic-transfer/transactions' },
];

type TransactionEditValues = {
  customerName?: string;
  customerPhone?: string;
  reason: string;
};

type DeactivateValues = {
  action: 'VOID' | 'REPLACE';
  reason: string;
  proposedCorrection?: string;
  wuUsdAmount?: number;
  wuVndAmount?: number;
  paidAmount?: number;
  fxAmount?: number;
  correctedData?: Record<string, number>;
};

type ReviewValues = { reason: string };

export function TransactionsMainPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const { currentShift } = useTransactionShift();
  const access = getTransactionAccess(role, currentShift);
  const { data: branches = [] } = useBranches();
  const isControlUser = role === 'director' || role === 'accountant';
  const scopedBranchId = isControlUser ? undefined : user?.branchId;
  const { data: wuTransactions = [], isLoading: isWuLoading } = useWuTransactions(scopedBranchId);
  const { data: mgTransactions = [], isLoading: isMgLoading } = useMgTransactions(scopedBranchId);
  const { data: fxTransactions = [], isLoading: isFxLoading } = useFxTransactions(scopedBranchId);
  const { data: domesticTransfers = [], isLoading: isDomesticLoading } = useQuery({
    queryKey: ['domestic-transfers', scopedBranchId ?? 'all'],
    queryFn: () => domesticTransferApi.list(scopedBranchId),
  });
  const [keyword, setKeyword] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | TransactionSource>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransactionStatus>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [editTarget, setEditTarget] = useState<AggregatedTransaction | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AggregatedTransaction | null>(null);
  const [adjustmentListOpen, setAdjustmentListOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    request: TransactionAdjustmentRequest;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [editForm] = Form.useForm<TransactionEditValues>();
  const [deactivateForm] = Form.useForm<DeactivateValues>();
  const adjustmentAction = Form.useWatch('action', deactivateForm) ?? 'REPLACE';
  const replacementFxAmount = Form.useWatch('fxAmount', deactivateForm) ?? 0;
  const [reviewForm] = Form.useForm<ReviewValues>();
  const isLoading = isWuLoading || isMgLoading || isFxLoading || isDomesticLoading;
  const canControlTransactions = isControlUser || isUiTestMode;
  const canRequestAdjustment = canControlTransactions || role === 'branch';
  const { data: adjustmentRequests = [], isLoading: isAdjustmentLoading } = useQuery({
    queryKey: ['transaction-adjustment-requests'],
    queryFn: () => transactionAdminApi.listAdjustmentRequests(),
    enabled: isControlUser,
  });
  const pendingAdjustmentCount = adjustmentRequests.filter((request) => request.status === 'PENDING').length;
  const invalidateTransactionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wu'] }),
      queryClient.invalidateQueries({ queryKey: ['mg'] }),
      queryClient.invalidateQueries({ queryKey: ['fx-trading'] }),
      queryClient.invalidateQueries({ queryKey: ['domestic-transfers'] }),
      queryClient.invalidateQueries({ queryKey: ['fund'] }),
      queryClient.invalidateQueries({ queryKey: ['debts'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
    ]);
  };
  const editMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TransactionEditValues }) =>
      transactionAdminApi.updateMetadata(id, values),
    onSuccess: async () => {
      await invalidateTransactionQueries();
      setEditTarget(null);
      editForm.resetFields();
      void message.success('Đã cập nhật thông tin giao dịch và ghi Audit Log');
    },
    onError: (error: unknown) => {
      void message.error(getApiErrorMessage(error, 'Không thể sửa giao dịch'));
    },
  });
  const adjustmentMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: DeactivateValues }) => {
      if (!isControlUser) return transactionAdminApi.createAdjustmentRequest(id, values);
      if (values.action === 'VOID') return transactionAdminApi.voidDirectly(id, values.reason);
      return transactionAdminApi.replaceDirectly(id, {
        action: 'REPLACE',
        reason: values.reason,
        proposedCorrection: values.proposedCorrection,
        correctedData: values.correctedData ?? {},
      });
    },
    onSuccess: async (_, variables) => {
      await invalidateTransactionQueries();
      await queryClient.invalidateQueries({ queryKey: ['transaction-adjustment-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setDeactivateTarget(null);
      deactivateForm.resetFields();
      void message.success(
        isControlUser
          ? variables.values.action === 'VOID'
            ? 'Đã hủy giao dịch và đảo quỹ/công nợ'
            : 'Đã thay thế giao dịch và ghi lại quỹ/công nợ'
          : 'Đã lập phiếu điều chỉnh và gửi duyệt',
      );
    },
    onError: (error: unknown) => {
      void message.error(getApiErrorMessage(error, 'Không thể lập phiếu điều chỉnh'));
    },
  });
  const reviewMutation = useMutation({
    mutationFn: ({ requestId, action, reason }: { requestId: string; action: 'APPROVE' | 'REJECT'; reason: string }) => (
      action === 'APPROVE'
        ? transactionAdminApi.approveAdjustmentRequest(requestId, reason)
        : transactionAdminApi.rejectAdjustmentRequest(requestId, reason)
    ),
    onSuccess: async (_, variables) => {
      await invalidateTransactionQueries();
      await queryClient.invalidateQueries({ queryKey: ['transaction-adjustment-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setReviewTarget(null);
      reviewForm.resetFields();
      void message.success(variables.action === 'APPROVE' ? 'Đã duyệt và ghi sổ phiếu điều chỉnh' : 'Đã từ chối phiếu điều chỉnh');
    },
    onError: (error: unknown) => {
      void message.error(getApiErrorMessage(error, 'Không thể xử lý phiếu điều chỉnh'));
    },
  });

  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, `${branch.code} - ${branch.name}`])),
    [branches],
  );
  const branchOptions = useMemo(
    () => branches
      .filter((branch) => branch.type !== 'HEAD_OFFICE')
      .map((branch) => ({ value: branch.id, label: `${branch.code} - ${branch.name}` })),
    [branches],
  );

  const transactions = useMemo<AggregatedTransaction[]>(() => {
    const rows = [
      ...wuTransactions.map((transaction) => {
        const branchId = transaction.branchId;
        return {
        key: transaction.id,
        code: transaction.transactionNo,
        source: 'WU' as const,
        type: `WU trả ${transaction.payoutCurrency}`,
        customerName: transaction.customerName ?? '',
        customerPhone: transaction.customerPhone ?? '',
        amountLabel: transaction.payoutCurrency === 'USD'
          ? `${formatUsd(transaction.receivedUsd)} + ${formatVnd(transaction.receivedVnd)}`
          : formatVnd(transaction.receivedVnd),
        vndAmount: transaction.transactionValueVnd,
        debtLabel: transaction.paidCurrency === 'USD'
          ? formatUsd(transaction.wuUsdAmount)
          : formatVnd(transaction.wuVndAmount),
        branchId,
        branch: branchNameById.get(branchId) ?? branchId,
        shiftCode: transaction.shiftCode ?? '',
        createdAt: formatDateTime(transaction.createdAt),
        status: normalizeTransactionStatus(transaction.status),
        debtStatus: transaction.debtStatus,
        createdAtRaw: transaction.createdAt,
        financialData: {
          wuUsdAmount: transaction.wuUsdAmount,
          wuVndAmount: transaction.wuVndAmount,
          appliedRate: transaction.appliedRate,
        },
        };
      }),
      ...mgTransactions.map((transaction) => {
        const branchId = transaction.branchId;
        return {
        key: transaction.id,
        code: transaction.transactionNo,
        source: 'MG' as const,
        type: `MG trả ${transaction.payoutCurrency}`,
        customerName: transaction.customerName ?? '',
        customerPhone: transaction.customerPhone ?? '',
        amountLabel: transaction.receivedUsd > 0
          ? `${formatUsd(transaction.receivedUsd)}${transaction.receivedVnd > 0 ? ` + ${formatVnd(transaction.receivedVnd)}` : ''}`
          : formatVnd(transaction.receivedVnd),
        vndAmount: transaction.transactionValueVnd,
        debtLabel: transaction.paidCurrency === 'USD'
          ? formatUsd(transaction.mgUsdAmount)
          : formatVnd(transaction.mgVndAmount),
        branchId,
        branch: branchNameById.get(branchId) ?? branchId,
        shiftCode: transaction.shiftCode ?? '',
        createdAt: formatDateTime(transaction.createdAt),
        status: normalizeTransactionStatus(transaction.status),
        debtStatus: transaction.debtStatus,
        createdAtRaw: transaction.createdAt,
        financialData: {
          paidAmount: transaction.paidCurrency === 'USD' ? transaction.mgUsdAmount : transaction.mgVndAmount,
          paidCurrency: transaction.paidCurrency,
          appliedRate: transaction.appliedRate,
        },
        };
      }),
      ...fxTransactions.map((transaction) => {
        const branchId = transaction.branchId;
        return {
        key: transaction.id,
        code: transaction.transactionNo,
        source: 'FX' as const,
        type: transaction.isBuy ? 'Mua ngoại tệ' : 'Bán ngoại tệ',
        customerName: transaction.customerName ?? '',
        customerPhone: transaction.customerPhone ?? '',
        amountLabel: `${formatExchangeRate(transaction.fxAmount)} ${transaction.fxCurrency}`,
        vndAmount: transaction.vndAmount,
        debtLabel: undefined,
        branchId,
        branch: branchNameById.get(branchId) ?? branchId,
        shiftCode: transaction.shiftCode ?? '',
        createdAt: formatDateTime(transaction.createdAt),
        status: normalizeTransactionStatus(transaction.status),
        createdAtRaw: transaction.createdAt,
        financialData: {
          fxAmount: transaction.fxAmount,
          fxCurrency: transaction.fxCurrency,
          appliedRate: transaction.rate,
        },
        };
      }),
      ...domesticTransfers.map((transaction) => {
        const branchId = transaction.branchId;
        return {
          key: transaction.id,
          code: transaction.transactionNo,
          source: 'DOMESTIC' as const,
          type: transaction.transferType === 'CASH_TO_BANK'
            ? 'Nhận tiền mặt, chuyển khoản'
            : 'Nhận chuyển khoản, trả tiền mặt',
          customerName: transaction.customerName ?? '',
          customerPhone: transaction.customerPhone ?? '',
          amountLabel: transaction.transferType === 'CASH_TO_BANK'
            ? `Tiền mặt vào ${formatVnd(transaction.cashAmount)}`
            : `Tiền mặt ra ${formatVnd(transaction.cashAmount)}`,
          vndAmount: transaction.transactionValueVnd,
          debtLabel: undefined,
          branchId,
          branch: branchNameById.get(branchId) ?? branchId,
          shiftCode: transaction.shiftCode ?? '',
          createdAt: formatDateTime(transaction.createdAt),
          status: normalizeTransactionStatus(transaction.status),
          createdAtRaw: transaction.createdAt,
        };
      }),
    ];

    return rows
      .sort((a, b) => Date.parse(b.createdAtRaw) - Date.parse(a.createdAtRaw))
      .map((transaction) => transaction);
  }, [branchNameById, domesticTransfers, fxTransactions, mgTransactions, wuTransactions]);

  const openEditModal = (transaction: AggregatedTransaction) => {
    setEditTarget(transaction);
    editForm.setFieldsValue({
      customerName: transaction.customerName,
      customerPhone: transaction.customerPhone,
      reason: undefined,
    });
  };

  const submitEdit = (values: TransactionEditValues) => {
    if (!editTarget) return;
    editMutation.mutate({ id: editTarget.key, values });
  };

  const openDeactivateModal = (transaction: AggregatedTransaction) => {
    setDeactivateTarget(transaction);
    deactivateForm.setFieldsValue({
      action: transaction.source === 'DOMESTIC' ? 'VOID' : 'REPLACE',
      reason: undefined,
      proposedCorrection: undefined,
      wuUsdAmount: transaction.financialData?.wuUsdAmount,
      wuVndAmount: transaction.financialData?.wuVndAmount,
      paidAmount: transaction.financialData?.paidAmount,
      fxAmount: transaction.financialData?.fxAmount,
    });
  };

  const submitDeactivate = (values: DeactivateValues) => {
    if (!deactivateTarget) return;
    let correctedData: Record<string, number> | undefined;
    if (values.action === 'REPLACE') {
      if (deactivateTarget.source === 'WU') {
        correctedData = { wuUsdAmount: Number(values.wuUsdAmount), wuVndAmount: Number(values.wuVndAmount) };
      } else if (deactivateTarget.source === 'MG') {
        correctedData = { paidAmount: Number(values.paidAmount) };
      } else if (deactivateTarget.source === 'FX') {
        correctedData = { fxAmount: Number(values.fxAmount) };
      }
    }
    adjustmentMutation.mutate({
      id: deactivateTarget.key,
      values: {
        action: values.action,
        reason: values.reason,
        proposedCorrection: values.proposedCorrection,
        correctedData,
      },
    });
  };

  const submitReview = (values: ReviewValues) => {
    if (!reviewTarget) return;
    reviewMutation.mutate({
      requestId: reviewTarget.request.id,
      action: reviewTarget.action,
      reason: values.reason,
    });
  };

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesKeyword = JSON.stringify(transaction).toLowerCase().includes(keyword.toLowerCase());
        const matchesSource = sourceFilter === 'ALL' || transaction.source === sourceFilter;
        const matchesStatus = statusFilter === 'ALL' || transaction.status === statusFilter;
        const matchesBranchScope = isControlUser || !scopedBranchId || transaction.branchId === scopedBranchId;
        const matchesBranch = !isControlUser || branchFilter === 'ALL' || transaction.branchId === branchFilter;
        const createdAt = Date.parse(transaction.createdAtRaw);
        const matchesDate = !dateRange?.[0] || !dateRange?.[1]
          || (createdAt >= dateRange[0].startOf('day').valueOf() && createdAt <= dateRange[1].endOf('day').valueOf());
        return matchesKeyword && matchesSource && matchesStatus && matchesBranchScope && matchesBranch && matchesDate;
      }),
    [branchFilter, dateRange, isControlUser, keyword, scopedBranchId, sourceFilter, statusFilter, transactions],
  );

  const columns: ColumnsType<AggregatedTransaction> = [
    {
      title: 'Giao dịch',
      key: 'transaction',
      width: 210,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.code}</Typography.Text>
          <Space size={4} wrap>
            <Tag color={sourceMeta[record.source].color}>{sourceMeta[record.source].label}</Tag>
            <Typography.Text type="secondary" className="text-xs!">{record.type}</Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Khách hàng',
      dataIndex: 'customerName',
      width: 170,
      render: (value: string, record) => (
        <div>
          <Typography.Text strong className="block!">{value || 'Chưa nhập'}</Typography.Text>
          {record.customerPhone && <Typography.Text type="secondary">{record.customerPhone}</Typography.Text>}
        </div>
      ),
    },
    {
      title: 'Giá trị giao dịch',
      key: 'transactionValue',
      align: 'right',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={0} align="end">
          <Typography.Text strong>{formatVnd(record.vndAmount)}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">{record.amountLabel}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Công nợ phát sinh',
      dataIndex: 'debtLabel',
      align: 'right',
      width: 160,
      render: (value?: string) => value
        ? <Typography.Text strong>{value}</Typography.Text>
        : <Typography.Text type="secondary">Không phát sinh</Typography.Text>,
    },
    {
      title: 'Chi nhánh / ca',
      key: 'branchShift',
      width: 210,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.branch}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">{record.shiftCode || 'Chưa gắn ca'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Thời gian / trạng thái',
      key: 'timeStatus',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.createdAt}</Typography.Text>
          <Tag color={statusMeta[record.status].color}>{statusMeta[record.status].label}</Tag>
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 150,
      render: (_, record) => {
        const isInactive = ['VOID', 'VOIDED', 'DEACTIVATED'].includes(record.status);
        const isReconciled = record.debtStatus === 'RECONCILED' || record.debtStatus === 'SETTLED';
        if ((!canControlTransactions && !canRequestAdjustment) || isInactive || isReconciled) {
          if (isReconciled) return <Tag color="blue">Đã đối chiếu · Chỉ xem</Tag>;
          return <Typography.Text type="secondary">Chỉ xem</Typography.Text>;
        }

        return (
          <Space size={4}>
            {canControlTransactions && (
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                Sửa
              </Button>
            )}
            {canRequestAdjustment && (
              <Button type="text" size="small" icon={<FileDoneOutlined />} onClick={() => openDeactivateModal(record)}>
                Điều chỉnh
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  const adjustmentColumns: ColumnsType<TransactionAdjustmentRequest> = [
    {
      title: 'Loại phiếu',
      width: 120,
      render: (_, request) => (
        <Tag color={request.payload?.action === 'REPLACE' ? 'blue' : 'red'}>
          {request.payload?.action === 'REPLACE' ? 'Thay thế' : 'Hủy GD'}
        </Tag>
      ),
    },
    {
      title: 'Giao dịch',
      render: (_, request) => (
        <div>
          <Typography.Text strong>{request.transaction?.transaction_no ?? request.entity_id}</Typography.Text>
          <div className="text-xs text-slate-500">
            {request.transaction?.operation_code} · {request.transaction?.branches?.code ?? '—'} · {request.transaction?.shifts?.shift_code ?? 'Không có ca'}
          </div>
        </div>
      ),
    },
    {
      title: 'Người lập',
      width: 150,
      render: (_, request) => request.users?.employees?.full_name ?? request.users?.username ?? '—',
    },
    {
      title: 'Nội dung',
      dataIndex: 'note',
      ellipsis: true,
    },
    {
      title: 'Ngày lập',
      dataIndex: 'requested_at',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 125,
      render: (value: TransactionAdjustmentRequest['status']) => (
        <Tag color={value === 'PENDING' ? 'gold' : value === 'APPROVED' ? 'green' : 'red'}>
          {value === 'PENDING' ? 'Chờ duyệt' : value === 'APPROVED' ? 'Đã duyệt' : value === 'REJECTED' ? 'Từ chối' : 'Đã hủy'}
        </Tag>
      ),
    },
    {
      title: '',
      width: 170,
      fixed: 'right',
      render: (_, request) => request.status === 'PENDING' ? (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            disabled={request.requested_by_user_id === user?.id}
            title={request.requested_by_user_id === user?.id ? 'Người lập không được tự duyệt phiếu' : undefined}
            onClick={() => {
              reviewForm.resetFields();
              setReviewTarget({ request, action: 'APPROVE' });
            }}
          >
            Duyệt
          </Button>
          <Button
            danger
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => {
              reviewForm.resetFields();
              setReviewTarget({ request, action: 'REJECT' });
            }}
          >
            Từ chối
          </Button>
        </Space>
      ) : <Typography.Text type="secondary">Đã xử lý</Typography.Text>,
    },
  ];

  const canCreate = access.canCreate || isUiTestMode;
  const activeShiftCode = currentShift?.code;
  const shiftTransactions = activeShiftCode
    ? transactions.filter((transaction) => transaction.shiftCode === activeShiftCode)
    : transactions;
  const summaryTransactions = isControlUser ? filteredTransactions : shiftTransactions;
  const summaryTotalVnd = summaryTransactions.reduce((sum, transaction) => sum + transaction.vndAmount, 0);
  const completedCount = summaryTransactions.filter((transaction) => transaction.status === 'COMPLETED').length;
  const internationalCount = summaryTransactions.filter((transaction) => ['WU', 'MG'].includes(transaction.source)).length;
  const openedAt = currentShift?.openedAt ? formatDateTime(currentShift.openedAt) : 'Chưa mở ca';
  const selectedPeriodLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`
    : 'Tất cả thời gian';
  const clearFilters = () => {
    setBranchFilter('ALL');
    setSourceFilter('ALL');
    setStatusFilter('ALL');
    setDateRange(null);
    setKeyword('');
  };

  return (
    <PageScaffold
      title="Tổng quan Giao Dịch"
      description={isControlUser
        ? 'GĐ/KTTH theo dõi toàn bộ giao dịch theo chi nhánh, loại giao dịch và khoảng ngày.'
        : 'Theo dõi giao dịch của chi nhánh đang làm việc theo ca hiện tại.'}
      moduleName="transactions"
    >
      <div className="space-y-4">
        {isControlUser && (
          <div className="flex justify-end">
            <Button icon={<FileDoneOutlined />} onClick={() => setAdjustmentListOpen(true)}>
              Phiếu điều chỉnh
              {pendingAdjustmentCount > 0 && <Tag color="gold" className="ml-1! mr-0!">{pendingAdjustmentCount} chờ duyệt</Tag>}
            </Button>
          </div>
        )}
        <Card className="transaction-command-center polished-card" classNames={{ body: 'p-0!' }}>
          <div className="grid xl:grid-cols-[1.1fr_1.4fr_1.1fr]">
            <div className="border-b border-slate-200 p-5 xl:border-r xl:border-b-0">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-lg bg-black text-brand-700">
                  <FieldTimeOutlined />
                </div>
                <div>
                  <Typography.Text type="secondary" className="text-xs! font-semibold! uppercase">{isControlUser ? 'Phạm vi' : 'Ca giao dịch'}</Typography.Text>
                  <Typography.Title level={4} className="m-0!">{isControlUser ? 'Toàn hệ thống' : currentShift?.branchName ?? 'Chưa có ca mở'}</Typography.Title>
                </div>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">{isControlUser ? 'Chi nhánh' : 'Mã ca'}</span>
                  <Typography.Text strong className="font-mono!">
                    {isControlUser
                      ? branchFilter === 'ALL' ? 'Tất cả' : branchOptions.find((branch) => branch.value === branchFilter)?.label ?? branchFilter
                      : activeShiftCode ?? '—'}
                  </Typography.Text>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">{isControlUser ? 'Thời gian' : 'Người mở'}</span>
                  <Typography.Text strong>
                    {isControlUser
                      ? selectedPeriodLabel
                      : currentShift?.openedBy ?? '—'}
                  </Typography.Text>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">{isControlUser ? 'Bộ lọc' : 'Thời gian mở'}</span>
                  <Typography.Text strong>
                    {isControlUser
                      ? sourceFilter === 'ALL' ? 'Tất cả loại GD' : sourceMeta[sourceFilter].label
                      : openedAt}
                  </Typography.Text>
                </div>
              </div>
              {isControlUser && (
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <Button className="w-full" icon={<ReloadOutlined />} onClick={clearFilters}>
                    Xóa bộ lọc
                  </Button>
                </div>
              )}
            </div>

            <div className="border-b border-slate-200 p-5 xl:border-r xl:border-b-0">
              <Typography.Text type="secondary" className="mb-4 block text-xs! font-semibold! uppercase">{isControlUser ? 'Thống kê theo bộ lọc' : 'Thống kê trong ca'}</Typography.Text>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6} xl={12}><Statistic title="Tổng GD" value={summaryTransactions.length} /></Col>
                <Col xs={12} md={6} xl={12}><Statistic title="Hoàn tất" value={completedCount} /></Col>
                <Col xs={12} md={6} xl={12}><Statistic title="WU / MG" value={internationalCount} /></Col>
                <Col xs={12} md={6} xl={12}><Statistic title="Quy đổi" value={summaryTotalVnd} formatter={(value) => formatVnd(Number(value))} /></Col>
              </Row>
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <Typography.Text type="secondary" className="text-xs! font-semibold! uppercase">Tạo giao dịch</Typography.Text>
                  <Typography.Title level={5} className="m-0!">Chọn nghiệp vụ</Typography.Title>
                </div>
                <Tag color={isControlUser ? 'blue' : canCreate ? 'green' : 'red'}>{isControlUser ? 'CONTROL' : canCreate ? 'OPEN' : 'LOCKED'}</Tag>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {createActions.map((action) => (
                  <Button
                    key={action.key}
                    className="justify-start! border-transparent! bg-brand-700! text-black! shadow-sm! hover:border-transparent! hover:bg-brand-600! hover:text-black! hover:shadow-md! disabled:border-transparent! disabled:bg-slate-200! disabled:text-slate-400! disabled:shadow-none!"
                    icon={action.icon}
                    disabled={!isControlUser && !canCreate}
                    onClick={() => navigate(action.path)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="polished-card">
          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={24} lg={6}>
              <Input.Search allowClear placeholder="Tìm mã GD, khách hàng..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select
                className="w-full"
                value={isControlUser ? branchFilter : scopedBranchId ?? 'ALL'}
                disabled={!isControlUser}
                onChange={setBranchFilter}
                options={[{ value: 'ALL', label: isControlUser ? 'Tất cả chi nhánh' : user?.branchName ?? 'Chi nhánh hiện tại' }, ...branchOptions]}
              />
            </Col>
            <Col xs={24} sm={12} lg={5}>
              <Select
                className="w-full"
                value={sourceFilter}
                onChange={(value: 'ALL' | TransactionSource) => setSourceFilter(value)}
                options={[{ value: 'ALL', label: 'Tất cả loại GD' }, ...Object.entries(sourceMeta).map(([value, meta]) => ({ value, label: meta.label }))]}
              />
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Select
                className="w-full"
                value={statusFilter}
                onChange={(value: 'ALL' | TransactionStatus) => setStatusFilter(value)}
                options={[{ value: 'ALL', label: 'Tất cả trạng thái' }, ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))]}
              />
            </Col>
            <Col xs={24} lg={4}>
              <DatePicker.RangePicker
                className="w-full"
                format={DATE_INPUT_FORMAT}
                placeholder={DATE_RANGE_PLACEHOLDERS}
                value={dateRange}
                onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
              />
            </Col>
          </Row>
          <Table
            rowKey="key"
            columns={columns}
            dataSource={filteredTransactions}
            loading={isLoading}
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>

      <Modal
        title={`Sửa giao dịch ${editTarget?.code ?? ''}`}
        open={Boolean(editTarget)}
        onCancel={() => setEditTarget(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <Form<TransactionEditValues> form={editForm} layout="vertical" onFinish={submitEdit}>
          <Alert
            className="mb-4"
            type="info"
            showIcon
            message="Chỉ sửa thông tin khách hàng"
            description="Chi nhánh, loại giao dịch, số tiền và tỷ giá đã phát sinh quỹ/công nợ nên không thể sửa trực tiếp. Nếu sai dữ liệu tài chính, hãy deactive giao dịch và tạo giao dịch thay thế."
          />
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="customerName" label="Khách hàng">
                <Input maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="customerPhone" label="Số điện thoại">
                <Input maxLength={30} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Chi nhánh"><Input value={editTarget?.branch} readOnly /></Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Giá trị giao dịch"><Input value={editTarget?.amountLabel} readOnly /></Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="reason" label="Lý do sửa" rules={[{ required: true, whitespace: true, message: 'Nhập lý do sửa để ghi Audit Log' }]}>
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditTarget(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={editMutation.isPending}>Lưu thay đổi</Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`${isControlUser ? (adjustmentAction === 'VOID' ? 'Hủy giao dịch' : 'Thay thế giao dịch') : 'Lập phiếu điều chỉnh'} ${deactivateTarget?.code ?? ''}`}
        open={Boolean(deactivateTarget)}
        onCancel={() => setDeactivateTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form<DeactivateValues> form={deactivateForm} layout="vertical" onFinish={submitDeactivate}>
          <Alert
            className="mb-4"
            type={isControlUser && adjustmentAction === 'VOID' ? 'error' : 'warning'}
            showIcon
            message={isControlUser
              ? adjustmentAction === 'VOID'
                ? 'Giao dịch sẽ được hủy và ghi bút toán đảo ngay'
                : 'Giao dịch cũ sẽ được đảo và thay thế ngay'
              : 'Phiếu cần được GĐ/KTTH duyệt trước khi ghi sổ'}
            description={isControlUser
              ? 'Chỉ giao dịch có công nợ PENDING mới được thao tác. Giao dịch đã RECONCILED hoặc SETTLED bị khóa.'
              : 'Nếu được duyệt, bút toán đảo và giao dịch thay thế được ghi vào ca đang mở; tỷ giá giao dịch cũ được giữ nguyên.'}
          />
          <Form.Item name="action" label="Cách xử lý" rules={[{ required: true }]}>
            <Segmented
              block
              options={[
                ...(deactivateTarget?.source === 'DOMESTIC'
                  ? []
                  : [{ label: 'Thay thế giao dịch', value: 'REPLACE' }]),
                { label: 'Hủy giao dịch', value: 'VOID' },
              ]}
            />
          </Form.Item>
          {adjustmentAction === 'REPLACE' && deactivateTarget?.source === 'WU' && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="wuUsdAmount" label="Amount USD đúng" rules={[{ required: true, type: 'number', min: 0.01, message: 'Nhập Amount USD lớn hơn 0' }]}>
                  <InputNumber className="w-full" min={0.01} precision={2} addonAfter="USD" formatter={usdInputFormatter} parser={usdInputParser} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="wuVndAmount" label="Amount VND đúng" rules={[{ required: true, type: 'number', min: 1, message: 'Nhập Amount VND lớn hơn 0' }]}>
                  <InputNumber className="w-full" min={1} precision={0} addonAfter="VND" formatter={numberInputFormatter} parser={numberInputParser} />
                </Form.Item>
              </Col>
            </Row>
          )}
          {adjustmentAction === 'REPLACE' && deactivateTarget?.source === 'MG' && (
            <Form.Item name="paidAmount" label={`Số tiền MG đúng (${deactivateTarget.financialData?.paidCurrency ?? ''})`} rules={[{ required: true, type: 'number', min: 0.01, message: 'Nhập số tiền lớn hơn 0' }]}>
              <InputNumber
                className="w-full"
                min={0.01}
                precision={deactivateTarget.financialData?.paidCurrency === 'VND' ? 0 : 2}
                addonAfter={deactivateTarget.financialData?.paidCurrency}
                formatter={deactivateTarget.financialData?.paidCurrency === 'VND' ? numberInputFormatter : usdInputFormatter}
                parser={deactivateTarget.financialData?.paidCurrency === 'VND' ? numberInputParser : usdInputParser}
              />
            </Form.Item>
          )}
          {adjustmentAction === 'REPLACE' && deactivateTarget?.source === 'FX' && (
            <>
              <Form.Item name="fxAmount" label={`Số lượng ngoại tệ đúng (${deactivateTarget.financialData?.fxCurrency ?? ''})`} rules={[{ required: true, type: 'number', min: 0.01, message: 'Nhập số lượng lớn hơn 0' }]}>
                <InputNumber className="w-full" min={0.01} precision={2} addonAfter={deactivateTarget.financialData?.fxCurrency} formatter={usdInputFormatter} parser={usdInputParser} />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Tỷ giá giữ lại">
                    <Input value={formatExchangeRate(deactivateTarget.financialData?.appliedRate ?? 0)} addonAfter="VND" readOnly />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Giá trị VND tính lại">
                    <Input
                      value={formatVnd(Math.round(Number(replacementFxAmount) * Number(deactivateTarget.financialData?.appliedRate ?? 0)))}
                      readOnly
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Alert
                className="mb-4"
                type="info"
                showIcon
                message="Số VND sẽ được tính lại theo số lượng mới và tỷ giá của giao dịch gốc"
                description="Nếu tỷ giá giao dịch gốc bị nhập sai, hãy chọn Hủy giao dịch và tạo lại giao dịch mới với tỷ giá đúng."
              />
            </>
          )}
          <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{ required: true, whitespace: true, message: 'Nhập lý do điều chỉnh' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Mô tả sai sót của giao dịch gốc" />
          </Form.Item>
          <Form.Item name="proposedCorrection" label="Nội dung đề nghị" rules={[{ required: adjustmentAction === 'REPLACE', whitespace: true, message: 'Nhập nội dung đề nghị điều chỉnh' }]}>
            <Input.TextArea rows={3} maxLength={1000} showCount placeholder={adjustmentAction === 'REPLACE' ? 'Mô tả số tiền đúng và căn cứ điều chỉnh' : 'Ghi chú thêm cho yêu cầu hủy (nếu có)'} />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeactivateTarget(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={adjustmentMutation.isPending}>
              {adjustmentAction === 'REPLACE'
                ? isControlUser ? 'Thay thế giao dịch ngay' : 'Gửi phiếu thay thế'
                : isControlUser ? 'Hủy giao dịch ngay' : 'Gửi phiếu hủy'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Phiếu điều chỉnh giao dịch"
        open={adjustmentListOpen}
        onCancel={() => setAdjustmentListOpen(false)}
        footer={null}
        width={1100}
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="Duyệt phiếu sẽ ghi bút toán đảo vào ca đang mở của chi nhánh"
          description="Phiếu không thể duyệt nếu chi nhánh chưa mở ca, công nợ đã được giải quyết hoặc giao dịch đã chốt Journal."
        />
        <Table<TransactionAdjustmentRequest>
          rowKey="id"
          loading={isAdjustmentLoading}
          columns={adjustmentColumns}
          dataSource={adjustmentRequests}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 8 }}
        />
      </Modal>

      <Modal
        title={reviewTarget?.action === 'APPROVE' ? 'Duyệt phiếu điều chỉnh' : 'Từ chối phiếu điều chỉnh'}
        open={Boolean(reviewTarget)}
        onCancel={() => setReviewTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form<ReviewValues> form={reviewForm} layout="vertical" onFinish={submitReview}>
          <Form.Item label="Giao dịch">
            <Input value={reviewTarget?.request.transaction?.transaction_no ?? ''} readOnly />
          </Form.Item>
          <Form.Item
            name="reason"
            label={reviewTarget?.action === 'APPROVE' ? 'Ý kiến duyệt' : 'Lý do từ chối'}
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập nội dung xử lý' }]}
          >
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setReviewTarget(null)}>Hủy</Button>
            <Button
              type="primary"
              danger={reviewTarget?.action === 'REJECT'}
              htmlType="submit"
              loading={reviewMutation.isPending}
            >
              {reviewTarget?.action === 'APPROVE' ? 'Duyệt và ghi sổ' : 'Xác nhận từ chối'}
            </Button>
          </div>
        </Form>
      </Modal>
    </PageScaffold>
  );
}
