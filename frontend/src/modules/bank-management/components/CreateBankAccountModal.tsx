// GĐ/KTTH khai báo tài khoản ngân hàng cho chi nhánh/Hội sở -> POST /bank/accounts
import { App, AutoComplete, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMemo } from 'react';
import { numberInputFormatter, numberInputParser } from '@/shared/utils/formatters';
import { getApiErrorMessage } from '@/shared/utils/errors';
import { useBranches } from '@/shared/hooks/useBranches';
import { useBanks, useCreateBankAccount } from '../hooks/useBank';

interface FormValues {
  branchId?: string;
  bankCode: string;
  bankName?: string;
  accountNo: string;
  accountName: string;
  currencyCode: 'VND' | 'USD';
  openingBalance?: number;
}

const DEFAULT_BANKS = [
  { code: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { code: 'MSB', name: 'Ngân hàng TMCP Hàng Hải' },
  { code: 'VCB', name: 'Ngân hàng TMCP Ngoại Thương' },
  { code: 'TCB', name: 'Ngân hàng TMCP Kỹ Thương' },
];

export function CreateBankAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const { data: branches = [] } = useBranches();
  const { data: banks = [] } = useBanks();
  const create = useCreateBankAccount();

  const bankOptions = useMemo(() => {
    const merged = new Map<string, string>();
    DEFAULT_BANKS.forEach((b) => merged.set(b.code, b.name));
    banks.forEach((b) => merged.set(b.code, b.name));
    return [...merged.entries()].map(([code, name]) => ({ value: code, label: `${code} — ${name}`, name }));
  }, [banks]);

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await create.mutateAsync({
        branchId: values.branchId || undefined,
        bankCode: values.bankCode.trim().toUpperCase(),
        bankName: values.bankName?.trim() || bankOptions.find((b) => b.value === values.bankCode.trim().toUpperCase())?.name,
        accountNo: values.accountNo.trim(),
        accountName: values.accountName.trim(),
        currencyCode: values.currencyCode,
        openingBalance: values.openingBalance ?? 0,
      });
      message.success('Đã tạo tài khoản ngân hàng');
      form.resetFields();
      onClose();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, 'Tạo tài khoản thất bại'));
    }
  };

  return (
    <Modal
      title="Thêm tài khoản ngân hàng"
      open={open}
      okText="Tạo tài khoản"
      cancelText="Hủy"
      confirmLoading={create.isPending}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={submit}
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={{ currencyCode: 'VND', openingBalance: 0 }}>
        <Form.Item name="branchId" label="Chi nhánh quản lý (không bắt buộc)"
          extra="Bỏ trống = tài khoản dùng chung toàn công ty. Mọi chi nhánh đều chọn được mọi tài khoản khi chuyển cho khách.">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Dùng chung toàn công ty (Hội sở)"
            options={branches.map((b) => ({ value: b.id, label: `${b.code} - ${b.name}` }))}
          />
        </Form.Item>
        <Form.Item name="bankCode" label="Ngân hàng" rules={[{ required: true, message: 'Chọn/nhập mã ngân hàng' }]}>
          <AutoComplete
            options={bankOptions}
            placeholder="ACB, MSB... (gõ mã mới nếu chưa có)"
            filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            onSelect={(value: string) => {
              const found = bankOptions.find((b) => b.value === value);
              if (found) form.setFieldValue('bankName', found.name);
            }}
          />
        </Form.Item>
        <Form.Item name="bankName" label="Tên ngân hàng (chỉ cần khi thêm ngân hàng mới)">
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item name="accountNo" label="Số tài khoản" rules={[{ required: true, message: 'Nhập số tài khoản' }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="accountName" label="Tên chủ tài khoản" rules={[{ required: true, message: 'Nhập tên tài khoản' }]}>
          <Input maxLength={255} />
        </Form.Item>
        <Form.Item name="currencyCode" label="Loại tiền" rules={[{ required: true }]}>
          <Select options={[{ value: 'VND', label: 'VND' }, { value: 'USD', label: 'USD' }]} />
        </Form.Item>
        <Form.Item name="openingBalance" label="Số dư đầu kỳ" extra="Số dư > 0 sẽ được ghi thành 1 biến động 'Số dư đầu kỳ' để truy vết.">
          <InputNumber className="w-full" min={0} formatter={numberInputFormatter} parser={numberInputParser} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
