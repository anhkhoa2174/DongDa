import { ArrowLeftOutlined, KeyOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, App, Button, Card, Form, Input, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../schemas/forgotPassword.schema';

export function ForgotPasswordPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { usernameOrEmail: '' },
  });

  const onSubmit = handleSubmit(async () => {
    await new Promise((r) => setTimeout(r, 600));
    await message.success('Đã gửi yêu cầu đến KTTH. Kiểm tra email sau 15-30 phút.');
    setTimeout(() => navigate('/login'), 1500);
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 text-2xl">
            <KeyOutlined />
          </div>
          <Typography.Title level={2} className="m-0!">Quên mật khẩu</Typography.Title>
          <Typography.Text type="secondary">
            Yêu cầu đặt lại mật khẩu sẽ được gửi đến Kế toán tổng hợp để xác minh.
          </Typography.Text>
        </div>

        <Form layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label="Username hoặc Email"
            validateStatus={errors.usernameOrEmail ? 'error' : undefined}
            help={errors.usernameOrEmail?.message}
          >
            <Controller
              control={control}
              name="usernameOrEmail"
              render={({ field }) => (
                <Input
                  {...field}
                  prefix={<MailOutlined />}
                  placeholder="VD: nv.minh hoặc minh@dongda.vn"
                  size="large"
                />
              )}
            />
          </Form.Item>

          <Alert
            type="warning"
            icon={<SafetyOutlined />}
            showIcon
            className="mb-4"
            message="Yêu cầu cần duyệt bởi KTTH"
            description="Vì lý do bảo mật, hệ thống không tự reset mật khẩu. KTTH sẽ xác minh danh tính và gửi mật khẩu tạm."
          />

          <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting}>
            Gửi yêu cầu đặt lại
          </Button>

          <Button
            type="link"
            block
            className="mt-3"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/login')}
          >
            Quay lại đăng nhập
          </Button>
        </Form>
      </Card>
    </div>
  );
}
