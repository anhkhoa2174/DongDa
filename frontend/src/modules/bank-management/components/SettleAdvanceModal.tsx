// Hoàn tạm ứng CK — bắt buộc chọn NGUỒN đối ứng (không tự sinh tiền):
//   Quỹ tiền mặt chi nhánh: trừ tiền mặt (đã thu của khách) -> cộng lại TK đã ứng
//   Tài khoản ngân hàng khác: CK nội bộ — trừ TK nguồn -> cộng TK đã ứng
import { App, Form, Input, Modal, Segmented, Select, Typography } from 'antd';
import { useMemo } from 'react';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { formatUsd, formatVnd } from '@/shared/utils/formatters';
import type { BankAccountDto, BankMovementDto } from '../api/bank.api';
import { useSettleAdvanceCk } from '../hooks/useBank';

interface FormValues {
  source: 'BRANCH_CASH' | 'BANK_ACCOUNT';
  sourceBankAccountId?: string;
  note?: string;
}

export function SettleAdvanceModal({
  advance, accounts, open, onClose,
}: { advance: BankMovementDto; accounts: BankAccountDto[]; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const settle = useSettleAdvanceCk();
  const target = accounts.find((a) => a.id === advance.bankAccountId);
  const money = advance.currencyCode === 'VND' ? formatVnd : formatUsd;

  const sourceOptions = useMemo(
    () => accounts
      .filter((a) => a.id !== advance.bankAccountId && a.currencyCode === advance.currencyCode && a.status === 'ACTIVE')
      .map((a) => ({
        value: a.id,
        label: `${a.bankCode} · ${a.accountNo} (${a.branchCode ?? '—'}) — dư ${money(a.currentBalance)}`,
      })),
    [accounts, advance, money],
  );

  const submit = async () => {
    const values = await form.validateFields();
    try {
      const result = await settle.mutateAsync({
        advanceId: advance.id,
        source: values.source,
        sourceBankAccountId: values.source === 'BANK_ACCOUNT' ? values.sourceBankAccountId : undefined,
        note: values.note?.trim() || undefined,
      });
      // Nói rõ tiền bị trừ ở đâu để KTTH nhìn thấy bút toán đối ứng
      message.success(result?.description ?? `Đã hoàn tạm ứng ${advance.movementNo}`, 6);
      form.resetFields();
      onClose();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Hoàn tạm ứng thất bại'));
    }
  };

  return (
    <Modal
      title={`Hoàn tạm ứng ${advance.movementNo}`}
      open={open}
      okText="Hoàn ứng"
      cancelText="Hủy"
      confirmLoading={settle.isPending}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={submit}
      destroyOnClose
    >
      <Typography.Paragraph type="secondary" className="mb-3!">
        Cộng lại <b>{money(advance.amount)}</b> vào TK {target ? `${target.bankCode} · ${target.accountNo}` : '—'}.
        Chọn nguồn tiền bị trừ đối ứng:
      </Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ source: 'BRANCH_CASH' }}>
        <Form.Item name="source" label="Nguồn hoàn ứng" rules={[{ required: true }]}>
          <Segmented
            block
            options={[
              { value: 'BRANCH_CASH', label: 'Quỹ tiền mặt chi nhánh' },
              { value: 'BANK_ACCOUNT', label: 'Tài khoản ngân hàng khác' },
            ]}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(a, b) => a.source !== b.source}>
          {({ getFieldValue }) => getFieldValue('source') === 'BANK_ACCOUNT' ? (
            <Form.Item name="sourceBankAccountId" label="Tài khoản nguồn (bị trừ)"
              rules={[{ required: true, message: 'Chọn tài khoản nguồn' }]}>
              <Select showSearch optionFilterProp="label" placeholder={`Cùng loại tiền ${advance.currencyCode}`} options={sourceOptions} />
            </Form.Item>
          ) : (
            <Typography.Paragraph type="secondary" className="text-xs!">
              Trừ quỹ tiền mặt {advance.currencyCode} của chi nhánh đã ứng (tiền mặt thu của khách), ghi phiếu chi + bút toán sổ quỹ.
            </Typography.Paragraph>
          )}
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={2} maxLength={500} placeholder="VD: hoàn cuối ngày 31/08, đã kiểm tiền mặt" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
