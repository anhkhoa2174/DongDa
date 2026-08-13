// Ca làm việc + Kiểm quỹ (API thật) — F8
import { useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LockOutlined,
  PlayCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { PageScaffold } from '@/shared/components/PageScaffold';
import { FundBalanceTable } from '@/shared/components/FundBalanceTable';
import { OperationalOverviewCard } from '@/shared/components/OperationalOverviewCard';
import { SectionCardTitle } from '@/shared/components/SectionCardTitle';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import type { FundBalanceDto } from '@/modules/fund-transfer/api/fundTransfer.api';
import { useFundBalances } from '@/modules/fund-transfer/hooks/useFundTransfers';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  numberInputFormatter,
  numberInputParser,
  usdInputFormatter,
  usdInputParser,
} from '@/shared/utils/formatters';
import { useCloseShift, useCurrentShift, useOpenShift } from '../hooks/useShift';
import type { CashCountLineDto, CountInput } from '../api/shift.api';

type CountFormValues = {
  counts?: Record<string, number>;
  note?: string;
};

type CountItem = {
  key: string;
  code: string;
  name: string;
  accountType: string;
  balance: number;
};

const currencyPriority = ['VND', 'USD'];

function money(n: number, currencyCode: string) {
  return formatCurrency(n, currencyCode, currencyCode === 'VND' ? 0 : 2);
}

function quantity(n: number, currencyCode: string) {
  return `${formatNumber(n, currencyCode === 'VND' ? 0 : 2)} ${currencyCode}`;
}

function varianceTag(v: number, currencyCode: string) {
  if (Math.abs(v) < 0.01) return <Tag color="green">KHỚP</Tag>;
  return v > 0
    ? <Tag color="blue">THỪA {money(v, currencyCode)}</Tag>
    : <Tag color="red">THIẾU {money(-v, currencyCode)}</Tag>;
}

function accountTypeLabel(accountType: string) {
  if (accountType === 'CASH') return 'Tiền mặt';
  if (accountType === 'FUND_A') return 'Quỹ A';
  return accountType;
}

function countItemsFromBalances(balances: FundBalanceDto[]): CountItem[] {
  const grouped = balances
    .filter((item) => item.accountType === 'CASH' || item.accountType === 'FUND_A')
    .reduce<Map<string, CountItem>>((result, item) => {
      const key = item.currencyCode;
      const current = result.get(key);
      const isBaseCash = item.currencyCode === 'VND' || item.currencyCode === 'USD';
      result.set(key, {
        key,
        code: item.currencyCode,
        name: isBaseCash ? `Quỹ tiền mặt ${item.currencyCode}` : `Quỹ A ${item.currencyCode}`,
        accountType: isBaseCash ? 'CASH' : 'FUND_A',
        balance: (current?.balance ?? 0) + item.balance,
      });
      return result;
    }, new Map());

  return [...grouped.values()]
    .sort((a, b) => {
      const balanceOrder = Number(Math.abs(b.balance) >= 0.005) - Number(Math.abs(a.balance) >= 0.005);
      const ap = currencyPriority.includes(a.code) ? currencyPriority.indexOf(a.code) : 99;
      const bp = currencyPriority.includes(b.code) ? currencyPriority.indexOf(b.code) : 99;
      return balanceOrder || ap - bp || a.code.localeCompare(b.code) || a.name.localeCompare(b.name);
    });
}

function initialCountValues(items: CountItem[]) {
  return {
    counts: Object.fromEntries(items.map((item) => [item.code, item.balance])),
  };
}

function countLines(values: CountFormValues, items: CountItem[]): CountInput[] {
  return items.map((item) => ({
    currency: item.code,
    actualAmount: Number(values.counts?.[item.code] ?? 0),
  }));
}

function inputProps(currencyCode: string) {
  if (currencyCode === 'USD') {
    return { precision: 2, formatter: usdInputFormatter, parser: usdInputParser };
  }
  return {
    precision: currencyCode === 'VND' ? 0 : 2,
    formatter: numberInputFormatter,
    parser: numberInputParser,
  };
}

const countCols: ColumnsType<CashCountLineDto> = [
  { title: 'Loại tiền', dataIndex: 'currencyCode' },
  {
    title: 'Số lượng',
    dataIndex: 'systemAmount',
    align: 'right',
    render: (value, row) => quantity(Number(value), row.currencyCode),
  },
  {
    title: 'Thực đếm',
    dataIndex: 'actualAmount',
    align: 'right',
    render: (value, row) => money(Number(value), row.currencyCode),
  },
  {
    title: 'Chênh lệch',
    dataIndex: 'variance',
    align: 'right',
    render: (value, row) => varianceTag(Number(value), row.currencyCode),
  },
];

export function ShiftWorkspacePage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const branchId = user?.branchId;
  const branchName = user?.branchName ?? 'Chi nhánh đang làm việc';
  const { data: current, isLoading } = useCurrentShift(branchId);
  const { data: balances = [], isLoading: isLoadingBalances } = useFundBalances(branchId);
  const openShift = useOpenShift();
  const closeShift = useCloseShift();
  const [openForm] = Form.useForm<CountFormValues>();
  const [closeForm] = Form.useForm<CountFormValues>();
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const countItems = useMemo(() => countItemsFromBalances(balances), [balances]);
  const shift = current?.shift;
  const openCount = current?.cashCounts?.[0];
  const latestCount = current?.cashCounts?.[current.cashCounts.length - 1];
  const hasDistinctLatestCount = Boolean(
    latestCount && (!openCount || latestCount.id !== openCount.id),
  );
  const isBusy = isLoading || isLoadingBalances;

  const showOpenModal = () => {
    openForm.setFieldsValue(initialCountValues(countItems));
    setIsOpenModalOpen(true);
  };

  const showCloseModal = () => {
    closeForm.setFieldsValue(initialCountValues(countItems));
    setIsCloseModalOpen(true);
  };

  const onOpen = async (values: CountFormValues) => {
    if (!branchId) return;
    try {
      await openShift.mutateAsync({
        branchId,
        openingCounts: countLines(values, countItems),
      });
      message.success('Đã mở ca và ghi nhận kiểm quỹ đầu ca');
      setIsOpenModalOpen(false);
      openForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Mở ca thất bại');
    }
  };

  const onClose = async (values: CountFormValues) => {
    if (!shift) return;
    try {
      await closeShift.mutateAsync({
        shiftId: shift.id,
        branchId,
        closingCounts: countLines(values, countItems),
        note: values.note?.trim() || undefined,
      });
      message.success('Đã đóng ca và ghi nhận kiểm quỹ cuối ca');
      setIsCloseModalOpen(false);
      closeForm.resetFields();
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? 'Đóng ca thất bại');
    }
  };

  return (
    <PageScaffold
      title="Ca làm việc & Kiểm quỹ"
      description="Staff xác nhận tồn quỹ đầu ca để mở ca, tạo giao dịch trong ca mở, rồi kiểm quỹ cuối ca khi đóng."
      moduleName="shift-management"
    >
      {!branchId ? (
        <Result
          status="warning"
          title="Tài khoản chưa gắn chi nhánh"
          subTitle="Staff cần được liên kết với một chi nhánh trước khi mở ca và tạo giao dịch."
        />
      ) : isBusy ? (
        <Card>
          <Spin /> <Typography.Text className="ml-2">Đang tải trạng thái ca và tồn quỹ...</Typography.Text>
        </Card>
      ) : (
        <div className="shift-workspace">
          <OperationalOverviewCard
            eyebrow="Ca làm việc hiện tại"
            title={branchName}
            icon={shift ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
            iconTone={shift ? 'success' : 'brand'}
            meta={(
              <Tag className="shift-hero__tag" color={shift ? 'green' : 'gold'}>
                {shift ? 'ĐANG HOẠT ĐỘNG' : 'CHƯA MỞ CA'}
              </Tag>
            )}
            aside={(
              <Button
                className={shift ? 'shift-hero__close-button' : 'shift-hero__open-button'}
                type={shift ? 'default' : 'primary'}
                danger={Boolean(shift)}
                icon={shift ? <LockOutlined /> : <PlayCircleOutlined />}
                onClick={shift ? showCloseModal : showOpenModal}
                disabled={!shift && countItems.length === 0}
                size="large"
              >
                {shift ? 'Kiểm quỹ và đóng ca' : 'Kiểm quỹ và mở ca'}
              </Button>
            )}
            metrics={[
              { icon: <SafetyCertificateOutlined />, label: 'Mã ca', value: shift?.shiftCode ?? 'Chưa cấp mã' },
              { icon: <UserOutlined />, label: 'Nhân viên phụ trách', value: user?.name ?? '—' },
              { icon: <ClockCircleOutlined />, label: 'Thời điểm mở', value: shift ? formatDateTime(shift.openedAt) : 'Chưa ghi nhận' },
            ]}
          />

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={16} className="flex">
              <Card
                className="shift-fund-panel w-full"
                title={<SectionCardTitle icon={<WalletOutlined />}>Chi tiết tồn quỹ</SectionCardTitle>}
                extra={<Tag>{countItems.length} loại tiền</Tag>}
              >
                <FundBalanceSummary items={countItems} />
              </Card>
            </Col>

            <Col xs={24} xl={8} className="flex">
              <Card className="shift-process-panel w-full" title="Quy trình trong ca">
                <div className="shift-process-list">
                  <ShiftProcessStep number="01" title="Kiểm quỹ đầu ca" detail={openCount ? 'Đã xác nhận số dư thực tế' : 'Xác nhận trước khi mở ca'} done={Boolean(openCount)} />
                  <ShiftProcessStep number="02" title="Thực hiện giao dịch" detail={shift ? 'WU, MG, ngoại tệ và chuyển tiền' : 'Khả dụng sau khi mở ca'} active={Boolean(shift)} />
                  <ShiftProcessStep number="03" title="Kiểm quỹ cuối ca" detail="Đối chiếu thực đếm với hệ thống" />
                </div>
                {!shift && (
                  <Alert
                    type="warning"
                    showIcon
                    className="mt-3"
                    message="Giao dịch đang tạm khóa"
                    description="Xác nhận tồn tiền thực tế để bắt đầu ca làm việc."
                  />
                )}
              </Card>
            </Col>
          </Row>

          {(openCount || hasDistinctLatestCount) && (
            <Card
              title={<SectionCardTitle icon={<SafetyCertificateOutlined />}>Lịch sử kiểm quỹ trong ca</SectionCardTitle>}
              extra={<Typography.Text type="secondary">Số liệu đã lưu trên hệ thống</Typography.Text>}
            >
              {openCount && <CountHistorySection title="Kiểm quỹ đầu ca" count={openCount} />}
              {hasDistinctLatestCount && latestCount && (
                <CountHistorySection title="Kiểm quỹ gần nhất" count={latestCount} divider={Boolean(openCount)} />
              )}
            </Card>
          )}

          <CountModal
            title="Xác nhận tồn đầu ca"
            open={isOpenModalOpen}
            form={openForm}
            items={countItems}
            alertType="warning"
            alertMessage="Kiểm tra tiền thực tế tại quầy trước khi mở ca."
            submitText="Xác nhận và mở ca"
            loading={openShift.isPending}
            onCancel={() => setIsOpenModalOpen(false)}
            onFinish={onOpen}
          />

          <CountModal
            title="Kiểm quỹ đóng ca"
            open={isCloseModalOpen}
            form={closeForm}
            items={countItems}
            alertType="info"
            alertMessage="Nhập số tiền thực đếm cuối ca. Sai lệch sẽ được lưu và gửi thông báo cho GĐ/KTTH."
            submitText="Đóng ca"
            loading={closeShift.isPending}
            danger
            showNote
            onCancel={() => setIsCloseModalOpen(false)}
            onFinish={onClose}
          />
        </div>
      )}
    </PageScaffold>
  );
}

function FundBalanceSummary({ items }: { items: CountItem[] }) {
  if (items.length === 0) {
    return <Alert type="warning" showIcon message="Chi nhánh chưa có sổ tiền mặt hoặc Quỹ A để kiểm quỹ." />;
  }

  return (
    <FundBalanceTable
      items={items.map((item) => ({
        key: item.key,
        currencyCode: item.code,
        accountType: item.accountType,
        accountName: item.name,
        balance: item.balance,
      }))}
      emptyText="Chi nhánh chưa có sổ tiền mặt hoặc Quỹ A để kiểm quỹ"
    />
  );
}

function CountModal({
  title,
  open,
  form,
  items,
  alertType,
  alertMessage,
  submitText,
  loading,
  danger,
  showNote,
  onCancel,
  onFinish,
}: {
  title: string;
  open: boolean;
  form: FormInstance<CountFormValues>;
  items: CountItem[];
  alertType: 'info' | 'warning';
  alertMessage: string;
  submitText: string;
  loading: boolean;
  danger?: boolean;
  showNote?: boolean;
  onCancel: () => void;
  onFinish: (values: CountFormValues) => void;
}) {
  const watchedCounts = Form.useWatch('counts', form);
  // Có chênh lệch nếu thực đếm khác tồn hệ thống ở bất kỳ loại tiền -> bắt buộc nhập lý do (BR-F8.4-01).
  const hasVariance = items.some((item) => {
    const actual = watchedCounts?.[item.code];
    return actual != null && Number(actual) !== Number(item.balance);
  });
  return (
    <Modal className="shift-count-modal" title={title} open={open} onCancel={onCancel} footer={null} width={820} destroyOnClose>
      <Alert type={alertType} showIcon className="mb-4" message={alertMessage} />
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <div className="shift-count-header">
          <span>Loại quỹ</span>
          <span>Số lượng</span>
          <span>Thực đếm</span>
        </div>
        <div className="shift-count-list">
          {items.map((item) => (
            <div className="shift-count-row" key={item.key}>
              <div className="shift-count-row__currency">
                <strong>{item.code}</strong>
                <Typography.Text type="secondary">{accountTypeLabel(item.accountType)} · {item.name}</Typography.Text>
              </div>
              <Typography.Text className="shift-count-row__system">{quantity(item.balance, item.code)}</Typography.Text>
              <div>
                <Form.Item
                  name={['counts', item.code]}
                  rules={[{ required: true, message: `Nhập số thực đếm ${item.code}` }]}
                  className="!mb-0"
                >
                  <InputNumber
                    min={0}
                    className="w-full"
                    addonAfter={item.code}
                    {...inputProps(item.code)}
                  />
                </Form.Item>
              </div>
            </div>
          ))}
        </div>
        {showNote && (
          <Form.Item
            name="note"
            label={hasVariance ? 'Lý do chênh lệch (bắt buộc)' : 'Ghi chú (tuỳ chọn)'}
            className="mt-4"
            rules={hasVariance ? [{ required: true, message: 'Kiểm quỹ có chênh lệch — vui lòng nhập lý do' }] : []}
          >
            <Input.TextArea rows={2} maxLength={500} showCount placeholder="VD: thiếu 100k do chi lẻ chưa ghi sổ" />
          </Form.Item>
        )}
        <Button
          type={danger ? 'default' : 'primary'}
          danger={danger}
          htmlType="submit"
          icon={danger ? <LockOutlined /> : <PlayCircleOutlined />}
          loading={loading}
          className="mt-5"
          disabled={items.length === 0}
          block
        >
          {submitText}
        </Button>
      </Form>
    </Modal>
  );
}

function ShiftProcessStep({
  number,
  title,
  detail,
  done = false,
  active = false,
}: {
  number: string;
  title: string;
  detail: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className={`shift-process-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}>
      <span className="shift-process-step__number">{done ? <CheckCircleOutlined /> : number}</span>
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Text type="secondary">{detail}</Typography.Text>
      </div>
      <ArrowRightOutlined className="shift-process-step__arrow" />
    </div>
  );
}

function CountHistorySection({
  title,
  count,
  divider = false,
}: {
  title: string;
  count: { countedAt: string; lines: CashCountLineDto[] };
  divider?: boolean;
}) {
  return (
    <section className={divider ? 'shift-count-history is-divided' : 'shift-count-history'}>
      <div className="shift-count-history__heading">
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Text type="secondary">{formatDateTime(count.countedAt)}</Typography.Text>
      </div>
      <Table
        size="small"
        rowKey="currencyCode"
        pagination={false}
        columns={countCols}
        dataSource={count.lines}
        scroll={{ x: 640 }}
      />
    </section>
  );
}
