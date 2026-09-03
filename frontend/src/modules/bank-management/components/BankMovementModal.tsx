// Modal nộp/rút tiền thủ công trên 1 tài khoản ngân hàng -> POST /bank/accounts/:id/movements
import { Alert, App, DatePicker, Form, Input, InputNumber, Modal, Segmented } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
  formatBankAccountLabel, numberInputFormatter, numberInputParser, usdInputFormatter, usdInputParser,
} from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { DATE_INPUT_FORMAT, DATE_INPUT_PLACEHOLDER } from '@/shared/utils/datePicker';
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

const DEFAULT_MOVEMENT_TYPE: Record<BankMovementDirection, ManualBankMovementType> = {
  IN: 'DEPOSIT',
  OUT: 'WITHDRAW',
};

const MOVEMENT_OPTIONS: Record<BankMovementDirection, Array<{ value: ManualBankMovementType; label: string }>> = {
  IN: [
    { value: 'DEPOSIT', label: 'Nạp vào tài khoản' },
    { value: 'TRANSFER_IN', label: 'Nhận chuyển khoản' },
  ],
  OUT: [
    { value: 'WITHDRAW', label: 'Rút tiền mặt' },
    { value: 'TRANSFER_OUT', label: 'Chuyển khoản đi' },
  ],
};

export function BankMovementModal({
  account, direction, open, onClose,
}: { account: BankAccountDto; direction: BankMovementDirection; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const create = useCreateBankMovement();
  const isVnd = account.currencyCode === 'VND';
  const movementType = Form.useWatch('movementType', form) ?? DEFAULT_MOVEMENT_TYPE[direction];
  const isCashTransfer = movementType === 'DEPOSIT' || movementType === 'WITHDRAW';
  const isTransferIn = movementType === 'TRANSFER_IN';
  const isTransferOut = movementType === 'TRANSFER_OUT';

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await create.mutateAsync({
        bankAccountId: account.id,
        input: {
          movementType: values.movementType,
          amount: values.amount,
          counterparty: values.movementType === 'TRANSFER_OUT'
            ? values.counterparty?.trim() || undefined
            : undefined,
          bankReference: values.movementType === 'TRANSFER_OUT'
            ? values.bankReference?.trim() || undefined
            : undefined,
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
      title={direction === 'IN' ? 'Ghi nhận tiền vào' : 'Ghi nhận tiền ra'}
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
        initialValues={{ movementType: DEFAULT_MOVEMENT_TYPE[direction], businessDate: dayjs() }}
      >
        <Form.Item label="Tài khoản">
          <Input value={formatBankAccountLabel(account)} disabled />
        </Form.Item>
        <Form.Item name="movementType" label="Nghiệp vụ" rules={[{ required: true, message: 'Chọn nghiệp vụ' }]}>
          <Segmented block options={MOVEMENT_OPTIONS[direction]} />
        </Form.Item>
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message={movementTypeLabel(movementType)}
          description={isCashTransfer
            ? movementType === 'DEPOSIT'
              ? 'Giảm quỹ tiền mặt công ty và tăng số dư tài khoản ngân hàng.'
              : 'Giảm số dư tài khoản ngân hàng và tăng quỹ tiền mặt công ty.'
            : 'Chỉ ghi nhận biến động trên tài khoản ngân hàng.'}
        />
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
        {isTransferOut && (
          <Form.Item name="counterparty" label="Người nhận / Số tài khoản" rules={[{ required: true, message: 'Nhập người nhận hoặc số tài khoản' }]}>
            <Input placeholder="Tên người nhận, số tài khoản..." maxLength={255} />
          </Form.Item>
        )}
        {isTransferOut && (
          <Form.Item name="bankReference" label="Mã tham chiếu ngân hàng">
            <Input placeholder="Không bắt buộc" maxLength={150} />
          </Form.Item>
        )}
        <Form.Item name="businessDate" label="Ngày nghiệp vụ">
          <DatePicker className="w-full" format={DATE_INPUT_FORMAT} placeholder={DATE_INPUT_PLACEHOLDER} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item
          name="description"
          label={isTransferIn ? 'Nội dung chuyển khoản' : 'Nội dung'}
          rules={isTransferIn || isTransferOut ? [{ required: true, message: 'Nhập nội dung chuyển khoản' }] : undefined}
        >
          <Input.TextArea rows={2} maxLength={500} placeholder={movementDescriptionPlaceholder(movementType)} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function movementTypeLabel(type: ManualBankMovementType) {
  switch (type) {
    case 'DEPOSIT': return 'Nạp vào tài khoản từ tiền mặt công ty';
    case 'WITHDRAW': return 'Rút tiền mặt về quỹ công ty';
    case 'TRANSFER_IN': return 'Nhận tiền chuyển khoản';
    case 'TRANSFER_OUT': return 'Chuyển khoản đi';
  }
}

function movementDescriptionPlaceholder(type: ManualBankMovementType) {
  switch (type) {
    case 'DEPOSIT': return 'Ví dụ: Nạp tiền mặt vào tài khoản';
    case 'WITHDRAW': return 'Ví dụ: Rút tiền mặt nhập quỹ';
    case 'TRANSFER_IN': return 'Nhập nội dung hiển thị trên giao dịch chuyển khoản';
    case 'TRANSFER_OUT': return 'Nhập nội dung chuyển khoản đi';
  }
}
