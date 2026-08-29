// Tạm ứng CK hằng ngày (DongDav6): nhân viên chi nhánh ứng trước để chuyển khoản cho khách
// -> POST /bank/advance-ck (số dư tài khoản giảm tạm thời); cuối ngày KTTH/GĐ "Hoàn" -> số dư trở lại.
import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect } from 'react';
import { numberInputFormatter, numberInputParser, usdInputFormatter, usdInputParser } from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useAuthStore } from '@/modules/auth/model/auth.store';
import { useBranches } from '@/shared/hooks/useBranches';
import type { BankAccountDto } from '../api/bank.api';
import { useRecordAdvanceCk } from '../hooks/useBank';

interface FormValues {
  branchId: string;
  amount: number;
  description: string;
}

export function AdvanceCkModal({ account, open, onClose }: { account: BankAccountDto; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const user = useAuthStore((state) => state.user);
  const isBranchUser = user?.role === 'branch';
  const { data: branches = [] } = useBranches();
  const record = useRecordAdvanceCk();
  const isVnd = account.currencyCode === 'VND';

  useEffect(() => {
    if (open) form.setFieldsValue({ branchId: isBranchUser ? user?.branchId : account.branchId });
  }, [open, form, isBranchUser, user?.branchId, account.branchId]);

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await record.mutateAsync({
        bankAccountId: account.id,
        branchId: values.branchId,
        amount: values.amount,
        description: values.description.trim(),
      });
      message.success('Đã ghi nhận tạm ứng CK');
      form.resetFields();
      onClose();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Ghi tạm ứng thất bại'));
    }
  };

  return (
    <Modal
      title="Ứng chuyển khoản cho khách (tạm ứng CK)"
      open={open}
      okText="Ghi tạm ứng"
      cancelText="Hủy"
      confirmLoading={record.isPending}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={submit}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Tài khoản chuyển đi">
          <Input value={`${account.bankCode} · ${account.accountNo} · ${account.currencyCode}`} disabled />
        </Form.Item>
        <Form.Item name="branchId" label="Chi nhánh ứng" rules={[{ required: true, message: 'Chọn chi nhánh' }]}
          extra="Cuối ngày KTTH/GĐ dùng tài khoản chính hoàn lại khoản ứng này.">
          <Select
            disabled={isBranchUser}
            showSearch
            optionFilterProp="label"
            options={branches.map((b) => ({ value: b.id, label: `${b.code} - ${b.name}` }))}
          />
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
        <Form.Item name="description" label="Mục đích / nội dung CK" rules={[{ required: true, message: 'Ghi rõ mục đích chuyển khoản' }]}>
          <Input.TextArea rows={2} maxLength={500} placeholder="VD: CK cho khách Nguyễn Văn A nhận tiền mặt tại quầy" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
