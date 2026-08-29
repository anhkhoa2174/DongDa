// Modal nộp/rút/chuyển khoản thủ công trên 1 tài khoản ngân hàng -> POST /bank/accounts/:id/movements
import { App, DatePicker, Form, Input, InputNumber, Modal, Segmented } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { numberInputFormatter, numberInputParser, usdInputFormatter, usdInputParser } from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';
import type { BankAccountDto, ManualBankMovementType } from '../api/bank.api';
import { useCreateBankMovement } from '../hooks/useBank';

export type BankMovementDirection = 'IN' | 'OUT';

interface FormValues {
  movementType: ManualBankMovementType;
  amount: number;
  counterparty?: string;
  bankReference?: string;
  description?: string;
  businessDate?: Dayjs;
}

const TYPE_OPTIONS: Record<BankMovementDirection, { value: ManualBankMovementType; label: string }[]> = {
  IN: [
    { value: 'TRANSFER_IN', label: 'Nhận chuyển khoản' },
    { value: 'DEPOSIT', label: 'Nộp tiền mặt vào tài khoản' },
  ],
  OUT: [
    { value: 'TRANSFER_OUT', label: 'Chuyển khoản đi' },
    { value: 'WITHDRAW', label: 'Rút tiền mặt' },
  ],
};

export function BankMovementModal({
  account, direction, open, onClose,
}: { account: BankAccountDto; direction: BankMovementDirection; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const create = useCreateBankMovement();
  const isVnd = account.currencyCode === 'VND';

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await create.mutateAsync({
        bankAccountId: account.id,
        input: {
          movementType: values.movementType,
          amount: values.amount,
          counterparty: values.counterparty?.trim() || undefined,
          bankReference: values.bankReference?.trim() || undefined,
          description: values.description?.trim() || undefined,
          businessDate: values.businessDate ? values.businessDate.format('YYYY-MM-DD') : undefined,
        },
      });
      message.success(direction === 'IN' ? 'Đã ghi nhận tiền vào tài khoản' : 'Đã ghi nhận tiền ra khỏi tài khoản');
      form.resetFields();
      onClose();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Ghi biến động thất bại'));
    }
  };

  return (
    <Modal
      title={direction === 'IN' ? 'Tiền vào tài khoản' : 'Tiền ra khỏi tài khoản'}
      open={open}
      okText="Xác nhận"
      cancelText="Hủy"
      confirmLoading={create.isPending}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={submit}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ movementType: TYPE_OPTIONS[direction][0].value, businessDate: dayjs() }}
      >
        <Form.Item label="Tài khoản">
          <Input value={`${account.bankCode} · ${account.accountNo} · ${account.currencyCode}`} disabled />
        </Form.Item>
        <Form.Item name="movementType" label="Hình thức" rules={[{ required: true }]}>
          <Segmented block options={TYPE_OPTIONS[direction]} />
        </Form.Item>
        <Form.Item name="amount" label={`Số tiền ${account.currencyCode}`} rules={[{ required: true, message: 'Nhập số tiền' }]}>
          <InputNumber
            className="w-full"
            min={0}
            precision={isVnd ? 0 : 2}
            formatter={isVnd ? numberInputFormatter : usdInputFormatter}
            parser={isVnd ? numberInputParser : usdInputParser}
            addonAfter={account.currencyCode}
          />
        </Form.Item>
        <Form.Item name="counterparty" label="Đối tác (người chuyển / người nhận)">
          <Input placeholder="Tên khách hàng, ngân hàng đối ứng..." maxLength={255} />
        </Form.Item>
        <Form.Item name="bankReference" label="Mã tham chiếu ngân hàng">
          <Input placeholder="Số bút toán / mã giao dịch trên app ngân hàng" maxLength={150} />
        </Form.Item>
        <Form.Item name="businessDate" label="Ngày nghiệp vụ">
          <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="description" label="Nội dung">
          <Input.TextArea rows={2} maxLength={500} placeholder={direction === 'IN' ? 'Nội dung tiền vào' : 'Nội dung tiền ra'} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
