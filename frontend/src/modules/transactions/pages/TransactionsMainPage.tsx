import {
  BankOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
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
  Modal,
  Row,
  Select,
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
  formatCurrency,
  formatExchangeRate,
  formatUsd,
  formatVnd,
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
  VOID: { label: 'Đã xóa', color: 'red' },
  VOIDED: { label: 'Đã xóa', color: 'red' },
  DEACTIVATED: { label: 'Đã xóa', color: 'red' },
  ADJUSTED: { label: 'Đã sửa', color: 'blue' },
};

const debtStatusMeta: Record<NonNullable<AggregatedTransaction['debtStatus']>, { label: string; color: string }> = {
  PENDING: { label: 'Chờ đối chiếu', color: 'gold' },
  RECONCILED: { label: 'Chờ thanh toán', color: 'blue' },
  SETTLED: { label: 'Đã thanh toán', color: 'green' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
};

function normalizeTransactionStatus(status?: string): TransactionStatus {
  if (status && status in statusMeta) return status as TransactionStatus;
  return 'COMPLETED';
}

function formatCustomerPayout(receivedUsd: number, receivedVnd: number) {
  const payouts: string[] = [];
  if (receivedUsd > 0) payouts.push(formatUsd(receivedUsd));
  if (receivedVnd > 0) payouts.push(formatVnd(receivedVnd));
  return payouts.join(' + ') || formatVnd(0);
}

function formatAppliedRate(rate: number, currency = 'USD') {
  return `Tỷ giá áp dụng: ${formatExchangeRate(rate)} VND/${currency}`;
}

const createActions = [
  { key: 'WU', label: 'Tạo WU', icon: <SendOutlined />, path: '/western-union/workspace' },
  { key: 'MG', label: 'Tạo MG', icon: <InboxOutlined />, path: '/moneygram/workspace' },
  { key: 'FX', label: 'Mua/Bán ngoại tệ', icon: <SwapOutlined />, path: '/foreign-exchange/workspace' },
  { key: 'DOMESTIC', label: 'Chuyển tiền', icon: <BankOutlined />, path: '/domestic-transfer/transactions' },
];

type DeactivateValues = {
  action: 'VOID' | 'REPLACE';
  reason: string;
  proposedCorrection?: string;
  correctedData?: Record<string, unknown>;
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
  const [deactivateTarget, setDeactivateTarget] = useState<AggregatedTransaction | null>(null);
  const [adjustmentListOpen, setAdjustmentListOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    request: TransactionAdjustmentRequest;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [deactivateForm] = Form.useForm<DeactivateValues>();
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
      queryClient.invalidateQueries({ queryKey: ['bank'] }),
      queryClient.invalidateQueries({ queryKey: ['debts'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
    ]);
  };
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
            : 'Đã sửa giao dịch, đảo sổ cũ và ghi lại quỹ/công nợ'
          : 'Đã gửi yêu cầu sửa/xóa giao dịch để duyệt',
      );
    },
    onError: (error: unknown) => {
      void message.error(getApiErrorMessage(error, 'Không thể xử lý yêu cầu sửa/xóa giao dịch'));
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
      void message.success(variables.action === 'APPROVE' ? 'Đã duyệt yêu cầu và ghi sổ' : 'Đã từ chối yêu cầu');
    },
    onError: (error: unknown) => {
      void message.error(getApiErrorMessage(error, 'Không thể xử lý yêu cầu sửa/xóa'));
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
        type: `Tỷ giá WU: ${formatExchangeRate(transaction.wuRate)} VND/USD`,
        customerName: transaction.customerName ?? '',
        customerPhone: transaction.customerPhone ?? '',
        customerReference: `MTCN: ${transaction.mtcn}`,
        amountLabel: formatCustomerPayout(transaction.receivedUsd, transaction.receivedVnd),
        valueDetail: formatAppliedRate(transaction.appliedRate),
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
        customerReference: `Reference: ${transaction.referenceNo}`,
        amountLabel: formatCustomerPayout(transaction.receivedUsd, transaction.receivedVnd),
        valueDetail: formatAppliedRate(transaction.appliedRate),
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
        amountLabel: transaction.isBuy
          ? formatVnd(transaction.vndAmount)
          : formatCurrency(transaction.fxAmount, transaction.fxCurrency),
        valueDetail: formatAppliedRate(transaction.rate, transaction.fxCurrency),
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
          type: `Phí GD: ${formatVnd(transaction.fee)}`,
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

  const openTransactionEdit = (transaction: AggregatedTransaction) => {
    if (transaction.source === 'WU') {
      navigate(`/western-union/workspace?edit=${transaction.key}`);
      return;
    }
    if (transaction.source === 'MG') {
      navigate(`/moneygram/workspace?edit=${transaction.key}`);
      return;
    }
    if (transaction.source === 'FX') {
      navigate(`/foreign-exchange/workspace?edit=${transaction.key}`);
      return;
    }
    void message.warning('Giao dịch chuyển tiền hiện chỉ hỗ trợ xóa và đảo bút toán');
  };

  const openTransactionAction = (transaction: AggregatedTransaction, action: 'VOID' | 'REPLACE') => {
    setDeactivateTarget(transaction);
    deactivateForm.setFieldsValue({
      action,
      reason: undefined,
      proposedCorrection: undefined,
    });
  };

  const submitDeactivate = (values: DeactivateValues) => {
    if (!deactivateTarget) return;
    adjustmentMutation.mutate({
      id: deactivateTarget.key,
      values: {
        action: values.action,
        reason: values.reason,
        proposedCorrection: values.proposedCorrection,
        correctedData: values.correctedData,
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
          {record.customerReference && (
            <Typography.Text type="secondary">{record.customerReference}</Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: 'Giá trị giao dịch',
      key: 'transactionValue',
      align: 'right',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={0} align="end">
          <Typography.Text strong>{record.amountLabel}</Typography.Text>
          {record.valueDetail && (
            <Typography.Text type="secondary" className="text-xs!">{record.valueDetail}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Công nợ',
      dataIndex: 'debtLabel',
      align: 'right',
      width: 160,
      render: (value: string | undefined, record) => {
        if (!value) return <Typography.Text type="secondary">Không phát sinh</Typography.Text>;
        const debtMeta = record.debtStatus ? debtStatusMeta[record.debtStatus] : undefined;
        return (
          <Space direction="vertical" size={2} align="end">
            <Typography.Text strong>{value}</Typography.Text>
            {debtMeta && <Tag color={debtMeta.color} className="m-0!">{debtMeta.label}</Tag>}
          </Space>
        );
      },
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
            {canRequestAdjustment && (
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                disabled={record.source === 'DOMESTIC'}
                title={record.source === 'DOMESTIC' ? 'Giao dịch chuyển tiền có bút toán ngân hàng/ứng chuyển khoản nên hiện chỉ cho phép xóa an toàn' : 'Sửa giao dịch'}
                onClick={() => openTransactionEdit(record)}
              >
                Sửa
              </Button>
            )}
            {canRequestAdjustment && (
              <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => openTransactionAction(record, 'VOID')}>
                Xóa
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
          {request.payload?.action === 'REPLACE' ? 'Sửa giao dịch' : 'Xóa giao dịch'}
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
              Yêu cầu sửa / xóa
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
        title={`Xóa giao dịch ${deactivateTarget?.code ?? ''}`}
        open={Boolean(deactivateTarget)}
        onCancel={() => setDeactivateTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form<DeactivateValues> form={deactivateForm} layout="vertical" onFinish={submitDeactivate}>
          <Alert
            className="mb-4"
            type={isControlUser ? 'error' : 'warning'}
            showIcon
            message={isControlUser
              ? 'Giao dịch sẽ được xóa và ghi bút toán đảo ngay'
              : 'Yêu cầu cần được GĐ/KTTH duyệt trước khi ghi sổ'}
            description={isControlUser
              ? 'Chỉ giao dịch có công nợ PENDING mới được thao tác. Giao dịch đã RECONCILED hoặc SETTLED bị khóa.'
              : 'Nếu được duyệt, giao dịch được hủy và bút toán đảo được ghi vào ca đang mở.'}
          />
          <Form.Item name="action" hidden><Input /></Form.Item>
          <Form.Item name="reason" label="Lý do xóa" rules={[{ required: true, whitespace: true, message: 'Nhập lý do xóa giao dịch' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Mô tả sai sót của giao dịch gốc" />
          </Form.Item>
          <Form.Item name="proposedCorrection" label="Ghi chú thêm">
            <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Thông tin bổ sung cho yêu cầu xóa (nếu có)" />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeactivateTarget(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={adjustmentMutation.isPending}>
              {isControlUser ? 'Xóa và đảo bút toán' : 'Gửi yêu cầu xóa'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Yêu cầu sửa / xóa giao dịch"
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
        title={reviewTarget?.action === 'APPROVE' ? 'Duyệt yêu cầu sửa/xóa' : 'Từ chối yêu cầu sửa/xóa'}
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
