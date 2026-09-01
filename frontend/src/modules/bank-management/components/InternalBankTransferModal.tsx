import { SwapOutlined } from '@ant-design/icons';
import { Alert, App, DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { getApiErrorMessage } from '@/shared/utils/errors';
import {
  numberInputFormatter, numberInputParser, usdInputFormatter, usdInputParser,
} from '@/shared/utils/formatters';
import type { BankAccountDto } from '../api/bank.api';
import { useInternalBankTransfer } from '../hooks/useBank';

interface FormValues {
  fromBankAccountId: string;
  toBankAccountId: string;
  amount: number;
  bankReference?: string;
  description?: string;
  businessDate: Dayjs;
}

function accountLabel(account: BankAccountDto) {
  return `${account.bankCode} · ${account.accountNo} · ${account.branchCode ?? account.branchName ?? 'Hội sở'} · ${account.currencyCode}`;
}

export function InternalBankTransferModal({
  accounts, sourceAccount, open, onClose,
}: {
  accounts: BankAccountDto[];
  sourceAccount?: BankAccountDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const transfer = useInternalBankTransfer();
  const sourceId = Form.useWatch('fromBankAccountId', form);
  const selectedSource = accounts.find((account) => account.id === sourceId);
  const destinationOptions = useMemo(
    () => accounts
      .filter((account) => account.status === 'ACTIVE')
      .filter((account) => account.id !== sourceId)
      .filter((account) => !selectedSource || account.currencyCode === selectedSource.currencyCode)
      .map((account) => ({ value: account.id, label: accountLabel(account) })),
    [accounts, selectedSource, sourceId],
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      fromBankAccountId: sourceAccount?.id,
      businessDate: dayjs(),
    });
  }, [form, open, sourceAccount?.id]);

  const close = () => {
    form.resetFields();
    onClose();
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      const result = await transfer.mutateAsync({
        fromBankAccountId: values.fromBankAccountId,
        toBankAccountId: values.toBankAccountId,
        amount: values.amount,
        bankReference: values.bankReference?.trim() || undefined,
        description: values.description?.trim() || undefined,
        businessDate: values.businessDate.format('YYYY-MM-DD'),
      });
      message.success(`Đã chuyển khoản nội bộ (${result.transferReference})`);
      close();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Chuyển khoản nội bộ thất bại'));
    }
  };

  const isVnd = selectedSource?.currencyCode === 'VND';

  return (
    <Modal
      title={<span><SwapOutlined /> CK nội bộ</span>}
      open={open}
      okText="Xác nhận chuyển"
      cancelText="Hủy"
      width={640}
      confirmLoading={transfer.isPending}
      onCancel={close}
      onOk={submit}
      destroyOnClose
    >
      <Alert
        className="mb-4"
        type="info"
        showIcon
        message="Luân chuyển giữa hai tài khoản nội bộ"
        description="Hệ thống đồng thời giảm tài khoản nguồn và tăng tài khoản đích. Hai biến động dùng chung một mã tham chiếu."
      />
      <Form form={form} layout="vertical">
        <Form.Item name="fromBankAccountId" label="Tài khoản nguồn" rules={[{ required: true, message: 'Chọn tài khoản nguồn' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Chọn tài khoản chuyển đi"
            options={accounts.filter((account) => account.status === 'ACTIVE').map((account) => ({
              value: account.id, label: accountLabel(account),
            }))}
            onChange={() => form.setFieldValue('toBankAccountId', undefined)}
          />
        </Form.Item>
        {selectedSource && (
          <Typography.Text type="secondary" className="-mt-4 mb-4 block!">
            Số dư nguồn: {selectedSource.currentBalance.toLocaleString('en-US')} {selectedSource.currencyCode}
          </Typography.Text>
        )}
        <Form.Item name="toBankAccountId" label="Tài khoản đích" rules={[{ required: true, message: 'Chọn tài khoản đích' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Chọn tài khoản nhận" options={destinationOptions} />
        </Form.Item>
        <Form.Item
          name="amount"
          label="Số tiền chuyển"
          rules={[
            { required: true, message: 'Nhập số tiền chuyển' },
            { validator: (_, value) => !selectedSource || Number(value) <= selectedSource.currentBalance
              ? Promise.resolve()
              : Promise.reject(new Error('Số tiền vượt quá số dư tài khoản nguồn')) },
          ]}
        >
          <InputNumber
            className="w-full"
            min={0}
            precision={isVnd ? 0 : 2}
            formatter={isVnd ? numberInputFormatter : usdInputFormatter}
            parser={isVnd ? numberInputParser : usdInputParser}
            addonAfter={selectedSource?.currencyCode ?? 'Tiền tệ'}
          />
        </Form.Item>
        <Form.Item name="businessDate" label="Ngày nghiệp vụ" rules={[{ required: true }]}>
          <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(date) => date.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="bankReference" label="Mã tham chiếu ngân hàng">
          <Input maxLength={150} placeholder="Không bắt buộc" />
        </Form.Item>
        <Form.Item name="description" label="Nội dung">
          <Input.TextArea rows={2} maxLength={500} placeholder="Ví dụ: Điều chuyển số dư từ ACB sang MSB" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
