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
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { formatDateTime, formatExchangeRate, formatUsd, formatVnd } from '@/shared/utils/formatters';
import { isUiTestMode } from '@/shared/config/runtime';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBranches as useWuBranches, useWuTransactions } from '@/modules/western-union/hooks/useWu';
import { useMgTransactions } from '@/modules/moneygram/hooks/useMg';
import { useFxTransactions } from '@/modules/foreign-exchange/hooks/useFx';
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
  reason: string;
  proposedCorrection?: string;
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
  const { data: branches = [] } = useWuBranches();
  const isControlUser = role === 'director' || role === 'accountant';
  const scopedBranchId = isControlUser ? undefined : user?.branchId;
  const { data: wuTransactions = [], isLoading: isWuLoading } = useWuTransactions(scopedBranchId);
  const { data: mgTransactions = [], isLoading: isMgLoading } = useMgTransactions(scopedBranchId);
  const { data: fxTransactions = [], isLoading: isFxLoading } = useFxTransactions(scopedBranchId);
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
  const [reviewForm] = Form.useForm<ReviewValues>();
  const isLoading = isWuLoading || isMgLoading || isFxLoading;
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
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? 'Không thể sửa giao dịch');
    },
  });
  const adjustmentMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: DeactivateValues }) =>
      transactionAdminApi.createAdjustmentRequest(id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transaction-adjustment-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setDeactivateTarget(null);
      deactivateForm.resetFields();
      void message.success('Đã lập phiếu điều chỉnh và gửi duyệt');
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? 'Không thể lập phiếu điều chỉnh');
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
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? 'Không thể xử lý phiếu điều chỉnh');
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
        type: `WU ${transaction.receivedUsd > 0 ? 'trả USD' : 'trả VND'}`,
        customerName: transaction.customerName ?? '',
        customerPhone: transaction.customerPhone ?? '',
        amountLabel: transaction.receivedUsd > 0
          ? `${formatUsd(transaction.receivedUsd)} + ${formatVnd(transaction.receivedVnd)}`
          : formatVnd(transaction.receivedVnd),
        vndAmount: transaction.receivedUsd * transaction.appliedRate + transaction.receivedVnd,
        branchId,
        branch: branchNameById.get(branchId) ?? branchId,
        shiftCode: transaction.shiftCode ?? '',
        createdAt: formatDateTime(transaction.createdAt),
        status: normalizeTransactionStatus(transaction.status),
        createdAtRaw: transaction.createdAt,
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
        amountLabel: transaction.payoutCurrency === 'USD'
          ? formatUsd(transaction.payoutAmount)
          : formatVnd(transaction.payoutAmount),
        vndAmount: transaction.payoutCurrency === 'USD'
          ? transaction.payoutAmount * transaction.appliedRate
          : transaction.payoutAmount,
        branchId,
        branch: branchNameById.get(branchId) ?? branchId,
        shiftCode: transaction.shiftCode ?? '',
        createdAt: formatDateTime(transaction.createdAt),
        status: normalizeTransactionStatus(transaction.status),
        createdAtRaw: transaction.createdAt,
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
  }, [branchNameById, fxTransactions, mgTransactions, wuTransactions]);

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
    deactivateForm.resetFields();
  };

  const submitDeactivate = (values: DeactivateValues) => {
    if (!deactivateTarget) return;
    adjustmentMutation.mutate({ id: deactivateTarget.key, values });
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
      title: 'Mã GD',
      dataIndex: 'code',
      fixed: 'left',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    { title: 'Nhóm GD', dataIndex: 'source', render: (value: TransactionSource) => <Tag color={sourceMeta[value].color}>{sourceMeta[value].label}</Tag> },
    { title: 'Loại giao dịch', dataIndex: 'type' },
    {
      title: 'Khách hàng',
      dataIndex: 'customerName',
      render: (value: string, record) => (
        <div>
          <Typography.Text strong className="block!">{value || 'Chưa nhập'}</Typography.Text>
          {record.customerPhone && <Typography.Text type="secondary">{record.customerPhone}</Typography.Text>}
        </div>
      ),
    },
    { title: 'Số tiền', dataIndex: 'amountLabel', align: 'right' },
    { title: 'Quy đổi VND', dataIndex: 'vndAmount', align: 'right', render: (value: number) => formatVnd(value) },
    { title: 'Chi nhánh', dataIndex: 'branch' },
    { title: 'Ca', dataIndex: 'shiftCode', render: (value?: string) => value || <Typography.Text type="secondary">Chưa gắn ca</Typography.Text> },
    { title: 'Thời gian', dataIndex: 'createdAt' },
    { title: 'Trạng thái', dataIndex: 'status', render: (value: TransactionStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag> },
    {
      title: '',
      key: 'actions',
      fixed: 'right',
      width: 170,
      render: (_, record) => {
        const isInactive = ['VOID', 'VOIDED', 'DEACTIVATED'].includes(record.status);
        if ((!canControlTransactions && !canRequestAdjustment) || isInactive) {
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
                format="DD/MM/YYYY"
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
            scroll={{ x: 1400 }}
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
        title={`Lập phiếu điều chỉnh ${deactivateTarget?.code ?? ''}`}
        open={Boolean(deactivateTarget)}
        onCancel={() => setDeactivateTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form<DeactivateValues> form={deactivateForm} layout="vertical" onFinish={submitDeactivate}>
          <Alert
            className="mb-4"
            type="warning"
            showIcon
            message="Phiếu cần được GĐ/KTTH duyệt trước khi ghi sổ"
            description="Nếu giao dịch thuộc ca đã đóng, bút toán đảo sẽ được ghi vào ca đang mở hiện tại của chi nhánh. Giao dịch đã chốt Journal không được điều chỉnh theo luồng này."
          />
          <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{ required: true, whitespace: true, message: 'Nhập lý do điều chỉnh' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Mô tả sai sót của giao dịch gốc" />
          </Form.Item>
          <Form.Item name="proposedCorrection" label="Nội dung đề nghị" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung đề nghị điều chỉnh' }]}>
            <Input.TextArea rows={3} maxLength={1000} showCount placeholder="Ví dụ: đảo giao dịch và tạo lại với số tiền đúng" />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeactivateTarget(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={adjustmentMutation.isPending}>
              Gửi phiếu duyệt
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
