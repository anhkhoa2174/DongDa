import {
  ArrowLeftOutlined,
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
  Slider,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FormInstance } from 'antd';
import { DATE_INPUT_FORMAT, DATE_RANGE_PLACEHOLDERS } from '@/shared/utils/datePicker';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { preventNumberInputEnter } from '@/shared/utils/formEvents';
import { getApiErrorMessage } from '@/shared/utils/errors';
import {
  exchangeRateInputFormatter,
  exchangeRateInputParser,
  formatDateTime,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { isUiTestMode } from '@/shared/config/runtime';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import type { Shift } from '@/modules/shift-management/model/shift.types';
import { useTransactionShift } from '../hooks/useTransactionShift';
import { getTransactionAccess } from '../model/transactionAccess';
import type { TransactionRecord, TransactionStatus } from '../model/transaction.types';

export type TransactionFormValues = Record<string, string | number | undefined> & {
  adjustmentReason?: string;
};

export type TransactionField = {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'segmented' | 'slider';
  required?: boolean;
  requiredWhen?: (values: TransactionFormValues) => boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  span?: 8 | 12 | 16 | 24;
  min?: number;
  max?: number;
  step?: number;
  rangeMinField?: string;
  rangeMaxField?: string;
  precision?: number;
  prefix?: string;
  suffix?: string;
  inputFormat?: 'vnd' | 'usd' | 'exchangeRate' | 'number';
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  readOnly?: boolean;
  positive?: boolean;
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
  createTransaction?: (values: TransactionFormValues) => Promise<unknown>;
  createOnly?: boolean;
  showHistory?: boolean;
  showBackButton?: boolean;
  showShiftHeader?: boolean;
  canCreateOverride?: boolean;
  onCreated?: () => void;
  createFormActions?: (form: FormInstance<TransactionFormValues>) => ReactNode;
};

const statusMeta: Record<TransactionStatus, { color: string; label: string }> = {
  COMPLETED: { color: 'green', label: 'Hoàn tất' },
  PENDING: { color: 'gold', label: 'Chờ xử lý' },
  VOID: { color: 'red', label: 'Đã void' },
  VOIDED: { color: 'red', label: 'Đã deactive' },
  DEACTIVATED: { color: 'red', label: 'Đã deactive' },
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
  createTransaction,
  createOnly = false,
  showHistory = true,
  showBackButton = false,
  showShiftHeader = true,
  canCreateOverride,
  onCreated,
  createFormActions,
}: TransactionWorkspacePageProps) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [createForm] = Form.useForm<TransactionFormValues>();
  const [editorForm] = Form.useForm<TransactionFormValues>();
  const user = useAuthStore((state) => state.user);
  const { currentShift } = useTransactionShift();
  const access = getTransactionAccess(user?.role, currentShift);
  const canCreate = canCreateOverride ?? (access.canCreate || isUiTestMode);
  const canUpdate = access.canUpdate || isUiTestMode;
  const canVoid = access.canVoid || isUiTestMode;
  const canAdjustClosed = access.canAdjustClosed || isUiTestMode;
  const [records, setRecords] = useState(initialRecords);
  const [isCreating, setIsCreating] = useState(false);
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
    if (createTransaction) {
      setIsCreating(true);
      try {
        await createTransaction(normalizedValues);
        createForm.resetFields();
        await message.success('Đã tạo giao dịch và ghi nhận biến động quỹ/ngân hàng');
        onCreated?.();
      } catch (error: unknown) {
        await message.error(getApiErrorMessage(error, 'Không thể tạo giao dịch'));
      } finally {
        setIsCreating(false);
      }
      return;
    }
    const now = new Date();
    const newRecord: TransactionRecord = {
      key: `${codePrefix}-${Date.now()}`,
      code: `${codePrefix}${String(Date.now()).slice(-6)}`,
      status: 'COMPLETED',
      shiftCode: currentShift?.code ?? '',
      createdAt: formatDateTime(now.toISOString()),
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
          className="transaction-form-card polished-card"
          title={
            <div className="flex items-center justify-between gap-4 max-xl:flex-col max-xl:items-start">
              <Space size={10}>
                <span className="grid size-9 place-items-center rounded-lg bg-black text-brand-700">
                  {formIcon}
                </span>
                <Typography.Text strong>{createLabel}</Typography.Text>
              </Space>
              {formSteps && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {formSteps.map((step, index) => (
                    <div className="flex items-center gap-2" key={step}>
                      {index > 0 && <div className="h-px w-8 bg-slate-200" />}
                      <div className="transaction-step flex items-center gap-1.5">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-black">
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
          {formNotice}
          {showShiftHeader && <ShiftReadOnlyHeader currentShift={currentShift} fallbackUserName={user?.name} />}
          <Form<TransactionFormValues>
            form={createForm}
            layout="vertical"
            onFinish={submitCreateTransaction}
            onKeyDownCapture={preventNumberInputEnter}
            disabled={!canCreate || isCreating}
            initialValues={initialFormValues}
            onValuesChange={(changedValues, allValues) =>
              onFormValuesChange?.(changedValues, allValues, createForm)
            }
          >
            <TransactionFields fields={fields} form={createForm} />
            {summaryRenderer && <TransactionFormSummary form={createForm} renderer={summaryRenderer} />}
            <div className="flex justify-end gap-2">
              {createFormActions?.(createForm)}
              <Button onClick={() => createForm.resetFields()}>Nhập lại</Button>
              <Button type="primary" htmlType="submit" loading={isCreating}>
                {createLabel}
              </Button>
            </div>
          </Form>
    </Card>
  );

  if (createOnly) {
    return createFormCard;
  }

  if (!showHistory) {
    return (
      <PageScaffold
        title={title}
        description={description}
        moduleName={moduleName}
        extra={showBackButton ? (
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>
            Quay lại Giao Dịch
          </Button>
        ) : undefined}
      >
        {createFormCard}
      </PageScaffold>
    );
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
          <Col xs={24} sm={12} xl={6}><Card className="transaction-stat-card polished-card"><Statistic title="Tổng giao dịch" value={records.length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card className="transaction-stat-card polished-card"><Statistic title="Hoàn tất" value={records.filter((item) => item.status === 'COMPLETED').length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card className="transaction-stat-card polished-card"><Statistic title="Void / Điều chỉnh" value={records.filter((item) => ['VOID', 'ADJUSTED'].includes(item.status)).length} /></Card></Col>
          <Col xs={24} sm={12} xl={6}><Card className="transaction-stat-card polished-card"><Statistic title="Giá trị quy đổi" value={totalValue} suffix="VND" /></Card></Col>
        </Row>

        <Card className="polished-card">
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
            <Col xs={24} sm={12} md={8}><DatePicker.RangePicker className="w-full" format={DATE_INPUT_FORMAT} placeholder={DATE_RANGE_PLACEHOLDERS} /></Col>
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
  currentShift: Shift | null;
  fallbackUserName?: string;
}) {
  const openedAt = currentShift?.openedAt
    ? formatDateTime(currentShift.openedAt)
    : 'UI TEST';

  return (
    <div className="shift-summary mb-5 rounded-lg border border-brand-100 p-4">
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
  const watchedValues = Form.useWatch(
    (values: TransactionFormValues) => values,
    form,
  ) ?? form.getFieldsValue(true);

  return <>{renderer(watchedValues)}</>;
}

function TransactionFields({
  fields,
  form,
}: {
  fields: TransactionField[];
  form: FormInstance<TransactionFormValues>;
}) {
  const watchedValues = Form.useWatch(
    (values: TransactionFormValues) => values,
    form,
  ) ?? form.getFieldsValue(true);

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
              rules={buildFieldRules(field, isDisabled, watchedValues)}
            >
              {renderField(field, isDisabled, watchedValues)}
            </Form.Item>
          </Col>
        );
      })}
    </Row>
  );
}

function buildFieldRules(
  field: TransactionField,
  isDisabled: boolean,
  values: TransactionFormValues,
) {
  const isRequired = !isDisabled && (field.required || field.requiredWhen?.(values));

  return [
    { required: isRequired, message: `Vui lòng nhập ${field.label.toLowerCase()}` },
    ...(field.pattern
      ? [{ pattern: field.pattern, message: field.patternMessage ?? `${field.label} không hợp lệ` }]
      : []),
    ...(['number', 'slider'].includes(field.kind)
      ? [{
          validator: (_: unknown, value: unknown) => validateNumericField(field, value, values, isDisabled),
        }]
      : []),
  ];
}

function validateNumericField(
  field: TransactionField,
  value: unknown,
  values: TransactionFormValues,
  isDisabled: boolean,
) {
  if (isDisabled || field.readOnly || value === undefined || value === null || value === '') {
    return Promise.resolve();
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return Promise.reject(new Error(`${field.label} phải là số hợp lệ`));
  }

  if (field.positive && numberValue <= 0) {
    return Promise.reject(new Error(`${field.label} phải lớn hơn 0`));
  }

  const min = getFieldMin(field, values);
  const max = getFieldMax(field, values);

  if (typeof min === 'number' && Number.isFinite(min) && numberValue < min) {
    return Promise.reject(new Error(`${field.label} không được nhỏ hơn ${formatNumberInputTooltip(min, field.precision ?? 0)}`));
  }

  if (typeof max === 'number' && Number.isFinite(max) && numberValue > max) {
    return Promise.reject(new Error(`${field.label} không được lớn hơn ${formatNumberInputTooltip(max, field.precision ?? 0)}`));
  }

  return Promise.resolve();
}

function getFieldMin(field: TransactionField, values: TransactionFormValues) {
  if (field.kind !== 'slider' || !field.rangeMinField || !field.rangeMaxField) return field.min;

  const rangeValues = getSliderRangeValues(field, values);
  return rangeValues.length > 0 ? Math.min(...rangeValues) : field.min;
}

function getFieldMax(field: TransactionField, values: TransactionFormValues) {
  if (field.kind !== 'slider' || !field.rangeMinField || !field.rangeMaxField) return field.max;

  const rangeValues = getSliderRangeValues(field, values);
  return rangeValues.length > 0 ? Math.max(...rangeValues) : field.max;
}

function getSliderRangeValues(field: TransactionField, values: TransactionFormValues) {
  return [
    Number(values[field.rangeMinField ?? ''] ?? field.min ?? 0),
    Number(values[field.rangeMaxField ?? ''] ?? field.max ?? 0),
  ].filter((value) => Number.isFinite(value) && value > 0);
}

function renderField(
  field: TransactionField,
  disabled = false,
  values: TransactionFormValues = {},
) {
  const controlClassName = 'h-10! w-full';

  if (field.kind === 'segmented') {
    return <Segmented className={controlClassName} block disabled={disabled || field.readOnly} options={field.options ?? []} />;
  }
  if (field.kind === 'select') {
    return <Select className={controlClassName} disabled={disabled || field.readOnly} placeholder={field.placeholder} options={field.options} />;
  }
  if (field.kind === 'slider') {
    const rangeValues = getSliderRangeValues(field, values);
    const min = rangeValues.length > 0 ? Math.min(...rangeValues) : field.min ?? 0;
    const max = rangeValues.length > 0 ? Math.max(...rangeValues) : field.max ?? min;

    return (
      <Slider
        className="mx-1!"
        min={min}
        max={Math.max(max, min)}
        step={field.step ?? 1}
        disabled={disabled || field.readOnly || min === 0 || max === 0}
        tooltip={{ formatter: (value) => formatNumberInputTooltip(value, field.precision ?? 2) }}
        marks={{
          [min]: formatNumberInputTooltip(min, field.precision ?? 0),
          [max]: formatNumberInputTooltip(max, field.precision ?? 0),
        }}
      />
    );
  }
  if (field.kind === 'number') {
    const inputFormat = getNumberInputFormat(field);
    const inputFormatter = inputFormat === 'usd' ? usdInputFormatter : inputFormat === 'number' ? usdInputFormatter : inputFormat === 'exchangeRate' ? exchangeRateInputFormatter : numberInputFormatter;
    const inputParser = inputFormat === 'usd' ? usdInputParser : inputFormat === 'number' ? usdInputParser : inputFormat === 'exchangeRate' ? exchangeRateInputParser : numberInputParser;

    return (
      <InputNumber
        className={controlClassName}
        min={field.min ?? 0}
        precision={field.precision}
        controls={false}
        keyboard={false}
        prefix={field.prefix}
        suffix={field.suffix}
        formatter={inputFormatter}
        parser={inputParser}
        placeholder={field.placeholder}
        disabled={disabled}
        readOnly={field.readOnly}
      />
    );
  }
  return <Input className={controlClassName} disabled={disabled} readOnly={field.readOnly} maxLength={field.maxLength} placeholder={field.placeholder} />;
}

function formatNumberInputTooltip(value: number | undefined, maximumFractionDigits: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function getNumberInputFormat(field: TransactionField) {
  if (field.inputFormat) return field.inputFormat;

  const normalizedName = field.name.toLowerCase();
  const normalizedLabel = field.label.toLowerCase();

  if (field.prefix === '$' || field.suffix === 'USD') return 'usd';
  if (field.prefix === '₫' || field.prefix === 'VND' || field.suffix === 'VND') return 'vnd';
  if (normalizedName.includes('rate') || normalizedLabel.includes('tỷ giá')) return 'exchangeRate';
  if (normalizedName.includes('vnd') || normalizedName.includes('fee')) return 'vnd';
  if (normalizedName.includes('amount') && !field.precision) return 'vnd';
  if (field.precision && field.precision > 0) return 'number';

  return 'vnd';
}
