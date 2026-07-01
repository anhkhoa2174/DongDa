import {
  AuditOutlined,
  BankOutlined,
  BuildOutlined,
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Form, Input, Select, Typography } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginFormValues } from '../schemas/login.schema';
import { useAuthStore } from '../model/auth.store';
import {
  defaultLoginBranchMock,
  loginBranchesMock,
  loginFormDefaultsMock,
  loginHighlightsMock,
} from '../data/login.mock';
import { authenticateMockAccount, mockAuthAccounts } from '../data/auth.mock';

export function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: loginFormDefaultsMock,
  });

  const onSubmit = handleSubmit(async (values) => {
    const account = authenticateMockAccount(values.username, values.password);

    if (!account) {
      await message.error('Sai tài khoản hoặc mật khẩu mock');
      return;
    }

    login(account.user);
    navigate(from, { replace: true });
  });

  return (
    <main className="flex min-h-screen bg-slate-50">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-lg bg-white text-2xl font-bold text-brand-800">Đ</div>
          <div>
            <div className="text-xl font-bold">CTY Đống Đa</div>
            <div className="text-xs font-medium text-brand-100 uppercase">Hệ thống vận hành tài chính</div>
          </div>
        </div>

        <div className="max-w-lg">
          <Typography.Title className="!mb-5 !text-4xl !leading-tight !text-white" level={1}>
            Quản lý tài chính<br />tập trung và an toàn
          </Typography.Title>
          <p className="mb-8 max-w-md leading-7 text-brand-100">
            Kiểm soát Western Union, MoneyGram, ngoại tệ, quỹ và dòng tiền trên toàn bộ chi nhánh
            với đối chiếu tự động và audit log đầy đủ.
          </p>

          <div className="space-y-3">
            {loginHighlightsMock.map((highlight) => (
              <div key={highlight.label} className="flex items-center gap-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-white/20 bg-white/10">
                  {highlight.icon}
                </span>
                <span>{highlight.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-brand-100">
          <span>© 2026 CTY Đống Đa · Bảo mật nội bộ</span>
          <div className="flex gap-4">
            <button type="button" className="cursor-pointer hover:text-white">Hỗ trợ</button>
            <button type="button" className="cursor-pointer hover:text-white">Tài liệu</button>
          </div>
        </div>
      </aside>

      <section className="flex w-full items-center justify-center px-6 py-10 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <div className="grid size-10 place-items-center rounded-md bg-brand-700 text-xl font-bold text-white">Đ</div>
            <div>
              <div className="font-bold text-slate-900">CTY Đống Đa</div>
              <div className="text-xs text-slate-500">Hệ thống vận hành tài chính</div>
            </div>
          </div>

          <div className="mb-8">
            <Typography.Title className="!mb-0 !text-3xl !text-slate-900" level={2}>Đăng nhập</Typography.Title>
            <p className="mt-2 text-sm text-slate-500">Nhập thông tin tài khoản để vào hệ thống.</p>
          </div>

          <Form className="[&_.ant-form-item]:mb-5" layout="vertical" onFinish={onSubmit}>
            <Form.Item
              label="Tên đăng nhập"
              validateStatus={errors.username ? 'error' : undefined}
              help={errors.username?.message}
            >
              <Controller
                control={control}
                name="username"
                render={({ field }) => (
                  <Input size="large" prefix={<UserOutlined className="text-slate-400" />} autoComplete="username" placeholder="VD: nv.minh" {...field} />
                )}
              />
            </Form.Item>

            <Form.Item
              label={
                <div className="flex w-full items-center justify-between">
                  <span>Mật khẩu</span>
                  <Button
                    className="!h-auto !p-0 !text-xs"
                    type="link"
                    onClick={() => message.info('Vui lòng liên hệ KTTH để đặt lại mật khẩu')}
                  >
                    Quên mật khẩu?
                  </Button>
                </div>
              }
              validateStatus={errors.password ? 'error' : undefined}
              help={errors.password?.message}
            >
              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <Input.Password size="large" prefix={<LockOutlined className="text-slate-400" />} autoComplete="current-password" placeholder="Nhập mật khẩu" {...field} />
                )}
              />
            </Form.Item>

            <Form.Item label="Chi nhánh đăng nhập" extra="Phạm vi dữ liệu sẽ được giới hạn theo quyền tài khoản.">
              <Select
                size="large"
                defaultValue={defaultLoginBranchMock}
                prefix={<BuildOutlined />}
                options={loginBranchesMock}
                suffixIcon={<BankOutlined className="text-slate-400" />}
              />
            </Form.Item>

            <div className="mb-5 flex items-center justify-between">
              <Checkbox>Ghi nhớ thiết bị trong 30 ngày</Checkbox>
            </div>

            <Button className="!h-12 !font-semibold" block type="primary" htmlType="submit" loading={isSubmitting}>
              Đăng nhập
            </Button>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Typography.Text strong className="block text-sm!">Tài khoản mock để test phân quyền</Typography.Text>
              <div className="mt-3 grid gap-2">
                {mockAuthAccounts.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-600 hover:text-brand-700"
                    onClick={() => {
                      setValue('username', account.username, { shouldValidate: true });
                      setValue('password', account.password, { shouldValidate: true });
                    }}
                  >
                    <span>
                      <span className="font-semibold">{account.username}</span>
                      <span className="ml-2 text-slate-500">{account.roleLabel}</span>
                    </span>
                    <span className="font-mono text-xs text-slate-400">{account.password}</span>
                  </button>
                ))}
              </div>
            </div>

            <Alert
              className="mt-5"
              type="info"
              showIcon
              icon={<AuditOutlined />}
              message="Bảo mật đăng nhập"
              description="Mọi lần đăng nhập được ghi vào Audit Log. Tài khoản sẽ tự khóa sau 5 lần sai mật khẩu."
            />
          </Form>
        </div>
      </section>
    </main>
  );
}
