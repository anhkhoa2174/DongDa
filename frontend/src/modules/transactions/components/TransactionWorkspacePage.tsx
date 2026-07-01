import {
  EditOutlined,
  FileSearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { isUiTestMode } from '@/shared/config/runtime';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useShiftStore } from '@/modules/shift-management/model/shift.store';
import { getTransactionAccess } from '../model/transactionAccess';
import type { TransactionRecord, TransactionStatus } from '../model/transaction.types';

export type TransactionFormValues = Record<string, string | number | undefined> & {
  adjustmentReason?: string;
};

export type TransactionField = {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'segmented';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  span?: 8 | 12 | 16 | 24;
  min?: number;
  precision?: number;
  prefix?: string;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  readOnly?: boolean;
  visibleWhen?: (values: TransactionFormValues) => boolean;
  disabledWhen?: (values: TransactionFormValues) => boolean;
};

type TransactionWorkspacePageProps = {
  title: string;
  description: string;
  moduleName: string;
  codePrefix: string;
  createLabel: string;
  fields: TransactionField[];
  columns: ColumnsType<TransactionRecord>;
  initialRecords: TransactionRecord[];
  formNotice?: ReactNode;
  formIcon?: ReactNode;
  formSteps?: string[];
  summaryRenderer?: (values: TransactionFormValues) => ReactNode;
  initialFormValues?: TransactionFormValues;
  onFormValuesChange?: (
    changedValues: TransactionFormValues,
    allValues: TransactionFormValues,
    form: FormInstance<TransactionFormValues>,
  ) => void;
  transformFormValues?: (values: TransactionFormValues) => TransactionFormValues;
  createOnly?: boolean;
  onCreated?: () => void;
};

const statusMeta: Record<TransactionStatus, { color: string; label: string }> = {
  COMPLETED: { color: 'green', label: 'Hoàn tất' },
  PENDING: { color: 'gold', label: 'Chờ xử lý' },
  VOID: { color: 'red', label: 'Đã void' },
  ADJUSTED: { color: 'blue', label: 'Đã điều chỉnh' },
};

export function TransactionWorkspacePage({
  title,
  description,
  moduleName,
  codePrefix,
  createLabel,
  fields,
  columns,
  initialRecords,
  formNotice,
  formIcon,
  formSteps,
  summaryRenderer,
  initialFormValues,
  onFormValuesChange,
  transformFormValues,
  createOnly = false,
  onCreated,
}: TransactionWorkspacePageProps) {
  const { message, modal } = App.useApp();
  const [createForm] = Form.useForm<TransactionFormValues>();
  const [editorForm] = Form.useForm<TransactionFormValues>();
  const user = useAuthStore((state) => state.user);
  const currentShift = useShiftStore((state) => state.currentShift);
  const access = getTransactionAccess(user?.role, currentShift);
  const canCreate = access.canCreate || isUiTestMode;
  const canUpdate = access.canUpdate || isUiTestMode;
  const canVoid = access.canVoid || isUiTestMode;
  const canAdjustClosed = access.canAdjustClosed || isUiTestMode;
  const [records, setRecords] = useState(initialRecords);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransactionStatus>('ALL');
  const [editor, setEditor] = useState<{
    mode: 'edit' | 'adjust';
    record: TransactionRecord;
  } | null>(null);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const matchesKeyword = JSON.stringify(record).toLowerCase().includes(keyword.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || record.status === statusFilter;
        return matchesKeyword && matchesStatus;
      }),
    [keyword, records, statusFilter],
  );

  const totalValue = records.reduce((sum, record) => sum + Number(record.vndAmount ?? record.amount ?? 0), 0);

  const openEditor = (mode: 'edit' | 'adjust', record: TransactionRecord) => {
    setEditor({ mode, record });
    editorForm.resetFields();
    editorForm.setFieldsValue(record);
  };

  const submitCreateTransaction = async (values: TransactionFormValues) => {
    if (!canCreate) {
      await message.error('Không thể tạo giao dịch khi chưa có ca OPEN');
      return;
    }

    const normalizedValues = transformFormValues?.(values) ?? values;
    const now = new Date();
    const newRecord: TransactionRecord = {
      key: `${codePrefix}-${Date.now()}`,
      code: `${codePrefix}${String(Date.now()).slice(-6)}`,
      status: 'COMPLETED',
      shiftCode: currentShift?.code ?? '',
      createdAt: now.toLocaleString('vi-VN'),
      createdBy: user?.name ?? 'Unknown',
      ...normalizedValues,
    };
    setRecords((current) => [newRecord, ...current]);
    createForm.resetFields();
    await message.success('Đã tạo giao dịch và gắn vào ca hiện tại');
    onCreated?.();
  };

  const submitEditedTransaction = async (values: TransactionFormValues) => {
    if (!editor) return;

    if (editor.mode === 'edit' && !canUpdate) {
      await message.error('Giao dịch đã bị khóa hoặc bạn không có quyền sửa');
      return;
    }
    if (editor.mode === 'adjust' && !canAdjustClosed) {
      await message.error('Chỉ KTTH/GĐ được điều chỉnh giao dịch sau khi đóng ca');
      return;
    }

    const normalizedValues = transformFormValues?.(values) ?? values;
    setRecords((current) =>
      current.map((record) =>
        record.key === editor.record.key
          ? {
              ...record,
              ...normalizedValues,
              status: editor.mode === 'adjust' ? 'ADJUSTED' : record.status,
            }
          : record,
      ),
    );
    await message.success(
      editor.mode === 'adjust'
        ? 'Đã lưu adjustment và ghi nhận Audit Log'
        : 'Đã cập nhật giao dịch',
    );

    setEditor(null);
    editorForm.resetFields();
  };

  const voidTransaction = (record: TransactionRecord) => {
    modal.confirm({
      title: `Void giao dịch ${record.code}?`,
      content: 'Giao dịch không bị xóa và vẫn được lưu đầy đủ trong Audit Log.',
      okText: 'Xác nhận void',
      okButtonProps: { danger: true },
      cancelText: 'Hủy',
      onOk: () => {
        setRecords((current) =>
          current.map((item) => (item.key === record.key ? { ...item, status: 'VOID' } : item)),
        );
        void message.success('Đã void giao dịch');
      },
    });
  };

  const actionColumn: ColumnsType<TransactionRecord>[number] = {
    title: '',
    key: 'actions',
    fixed: 'right',
    width: 190,
    render: (_, record) => {
      if (record.status === 'VOID') return <Typography.Text type="secondary">Chỉ xem</Typography.Text>;

      return (
        <Space size={4}>
          {canUpdate && (
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditor('edit', record)}>
              Sửa
            </Button>
          )}
          {canVoid && (
            <Button danger type="text" size="small" icon={<StopOutlined />} onClick={() => voidTransaction(record)}>
              Void
            </Button>
          )}
          {canAdjustClosed && (
            <Button type="text" size="small" icon={<FileSearchOutlined />} onClick={() => openEditor('adjust', record)}>
              Điều chỉnh
            </Button>
          )}
          {!canUpdate && !canVoid && !canAdjustClosed && (
            <Typography.Text type="secondary">Chỉ xem</Typography.Text>
          )}
        </Space>
      );
    },
  };

  const tableColumns: ColumnsType<TransactionRecord> = [
    {
      title: 'Mã GD',
      dataIndex: 'code',
      fixed: 'left',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    ...columns,
    { title: 'Ca', dataIndex: 'shiftCode' },
    { title: 'Người tạo', dataIndex: 'createdBy' },
    { title: 'Thời gian', dataIndex: 'createdAt' },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value: TransactionStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>,
    },
    actionColumn,
  ];

  const createFormCard = (
    <Card
          title={
            <div className="flex items-center justify-between gap-4 max-xl:flex-col max-xl:items-start">
              <Space>
                {formIcon}
                <Typography.Text strong>{createLabel}</Typography.Text>
              </Space>
              {formSteps && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {formSteps.map((step, index) => (
                    <div className="flex items-center gap-2" key={step}>
                      {index > 0 && <div className="h-px w-8 bg-slate-200" />}
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                          {index + 1}
                        </div>
                        <span className="font-medium text-slate-600">{step}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          }
    >
          {!createOnly && formNotice}
          <ShiftReadOnlyHeader currentShift={currentShift} fallbackUserName={user?.name} />
          <Form<TransactionFormValues>
            form={createForm}
            layout="vertical"
            onFinish={submitCreateTransaction}
            disabled={!canCreate}
            initialValues={initialFormValues}
            onValuesChange={(changedValues, allValues) =>
              onFormValuesChange?.(changedValues, allValues, createForm)
            }
          >
            <TransactionFields fields={fields} form={createForm} />
            {summaryRenderer && <TransactionFormSummary form={createForm} renderer={summaryRenderer} />}
            <div className="flex justify-end gap-2">
              <Button onClick={() => createForm.resetFields()}>Nhập lại</Button>
              <Button type="primary" htmlType="submit">
                {createLabel}
              </Button>
            </div>
          </Form>
    </Card>
  );

  if (createOnly) {
    return createFormCard;
  }

  return (
    <PageScaffold
      title={title}
      description={description}
      moduleName={moduleName}
    >
      <div className="space-y-4">
        {createFormCard}

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tổng giao dịch" value={records.length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Hoàn tất" value={records.filter((item) => item.status === 'COMPLETED').length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Void / Điều chỉnh" value={records.filter((item) => ['VOID', 'ADJUSTED'].includes(item.status)).length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card><Statistic title="Giá trị quy đổi" value={totalValue} suffix="₫" /></Card></Col>
        </Row>

        <Card>
          <Row gutter={[12, 12]} className="mb-4">
            <Col xs={24} md={10}>
              <Input.Search allowClear placeholder="Tìm mã GD, khách hàng, MSKH..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                className="w-full"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'ALL', label: 'Tất cả trạng thái' },
                  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
                ]}
              />
            </Col>
            <Col xs={24} sm={12} md={8}><DatePicker.RangePicker className="w-full" format="DD/MM/YYYY" /></Col>
          </Row>
          <Table columns={tableColumns} dataSource={filteredRecords} scroll={{ x: 1500 }} pagination={{ pageSize: 10 }} />
        </Card>
      </div>

      <Modal
        title={
          editor?.mode === 'adjust'
            ? `Điều chỉnh ${editor.record.code}`
            : `Sửa ${editor?.record.code ?? ''}`
        }
        open={Boolean(editor)}
        onCancel={() => setEditor(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <Form<TransactionFormValues>
          form={editorForm}
          layout="vertical"
          onFinish={submitEditedTransaction}
          onValuesChange={(changedValues, allValues) =>
            onFormValuesChange?.(changedValues, allValues, editorForm)
          }
        >
          <TransactionFields fields={fields} form={editorForm} />
          {editor?.mode === 'adjust' && (
            <Form.Item name="adjustmentReason" label="Lý do điều chỉnh" rules={[{ required: true, message: 'Bắt buộc nhập lý do điều chỉnh' }]}>
              <Input.TextArea rows={3} placeholder="Mô tả sai sót và lý do cần điều chỉnh" />
            </Form.Item>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditor(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              {editor?.mode === 'adjust' ? 'Lưu adjustment' : 'Lưu giao dịch'}
            </Button>
          </div>
        </Form>
      </Modal>
    </PageScaffold>
  );
}

function ShiftReadOnlyHeader({
  currentShift,
  fallbackUserName,
}: {
  currentShift: ReturnType<typeof useShiftStore.getState>['currentShift'];
  fallbackUserName?: string;
}) {
  const openedAt = currentShift?.openedAt
    ? new Date(currentShift.openedAt).toLocaleString('vi-VN')
    : 'UI TEST';

  return (
    <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Typography.Text strong>Thông tin ca</Typography.Text>
        <Tag color={currentShift?.status === 'OPEN' || !currentShift ? 'green' : 'red'}>
          {currentShift?.status ?? 'OPEN'}
        </Tag>
      </div>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <Typography.Text type="secondary" className="block text-xs!">Mã ca</Typography.Text>
          <Typography.Text strong>{currentShift?.code ?? 'UI-TEST-SHIFT'}</Typography.Text>
        </Col>
        <Col xs={24} md={8}>
          <Typography.Text type="secondary" className="block text-xs!">Chi nhánh</Typography.Text>
          <Typography.Text strong>{currentShift?.branchName ?? 'Chi nhánh test'}</Typography.Text>
        </Col>
        <Col xs={24} md={8}>
          <Typography.Text type="secondary" className="block text-xs!">Người mở ca</Typography.Text>
          <Typography.Text strong>{currentShift?.openedBy ?? fallbackUserName ?? 'UI Test'}</Typography.Text>
        </Col>
        <Col xs={24} md={8}>
          <Typography.Text type="secondary" className="block text-xs!">Thời gian mở</Typography.Text>
          <Typography.Text strong>{openedAt}</Typography.Text>
        </Col>
      </Row>
    </div>
  );
}

function TransactionFormSummary({
  form,
  renderer,
}: {
  form: FormInstance<TransactionFormValues>;
  renderer: (values: TransactionFormValues) => ReactNode;
}) {
  const watchedValues = Form.useWatch([], form) ?? form.getFieldsValue(true);

  return <>{renderer(watchedValues)}</>;
}

function TransactionFields({
  fields,
  form,
}: {
  fields: TransactionField[];
  form: FormInstance<TransactionFormValues>;
}) {
  const watchedValues = Form.useWatch([], form) ?? form.getFieldsValue(true);

  return (
    <Row gutter={12}>
      {fields.map((field) => {
        if (field.visibleWhen && !field.visibleWhen(watchedValues)) return null;
        const isDisabled = field.disabledWhen?.(watchedValues) ?? false;

        return (
          <Col xs={24} md={field.span ?? 12} key={field.name}>
            <Form.Item
              className="mb-4! w-full"
              name={field.name}
              label={field.label}
              rules={[
                { required: field.required && !isDisabled, message: `Vui lòng nhập ${field.label.toLowerCase()}` },
                ...(field.pattern
                  ? [{ pattern: field.pattern, message: field.patternMessage ?? `${field.label} không hợp lệ` }]
                  : []),
              ]}
            >
              {renderField(field, isDisabled)}
            </Form.Item>
          </Col>
        );
      })}
    </Row>
  );
}

function renderField(field: TransactionField, disabled = false) {
  const controlClassName = "h-10! w-full";

  if (field.kind === 'segmented') {
    return <Segmented className={controlClassName} block disabled={disabled || field.readOnly} options={field.options ?? []} />;
  }
  if (field.kind === 'select') {
    return <Select className={controlClassName} disabled={disabled || field.readOnly} placeholder={field.placeholder} options={field.options} />;
  }
  if (field.kind === 'number') {
    return (
      <InputNumber
        className={controlClassName}
        min={field.min ?? 0}
        precision={field.precision}
        controls={false}
        prefix={field.prefix}
        placeholder={field.placeholder}
        disabled={disabled}
        readOnly={field.readOnly}
      />
    );
  }
  return <Input className={controlClassName} disabled={disabled} readOnly={field.readOnly} maxLength={field.maxLength} placeholder={field.placeholder} />;
}
