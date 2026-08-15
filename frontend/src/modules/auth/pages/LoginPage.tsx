import {
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App, Button, Form, Input, Typography } from 'antd';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginWithApi } from '../api/auth.api';
import { loginSchema, type LoginFormValues } from '../schemas/login.schema';
import { useAuthStore } from '../model/auth.store';
import { loginFormDefaultsMock, loginHighlightsMock } from '../data/login.mock';

const businessLogoSrc = '/company-logo.jpg';

export function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: loginFormDefaultsMock,
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await loginWithApi(values);

      login(result.user, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      navigate(from, { replace: true });
    } catch {
      await message.error('Tên đăng nhập hoặc mật khẩu không đúng');
    }
  });

  return (
    <main className="flex min-h-screen bg-white">
      <aside className="login-hero relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
            <img src={businessLogoSrc} alt="CTY Đống Đa" className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <div className="text-xl font-bold">CTY Đống Đa</div>
            <div className="text-xs font-medium text-brand-100 uppercase">Hệ thống vận hành tài chính</div>
          </div>
        </div>

        <div className="max-w-lg">
          <Typography.Title className="!mb-5 !text-4xl !leading-tight !text-white" level={1}>
            Quản lý tài chính<br />tập trung và an toàn
          </Typography.Title>
          <p className="mb-8 max-w-md leading-7 text-zinc-300">
            Kiểm soát Western Union, MoneyGram, ngoại tệ, quỹ và dòng tiền trên toàn bộ chi nhánh
            với đối chiếu tự động và audit log đầy đủ.
          </p>

          <div className="space-y-3">
            {loginHighlightsMock.map((highlight) => (
              <div key={highlight.label} className="flex items-center gap-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-white/20 bg-white/10">
                  <span className="text-brand-700">{highlight.icon}</span>
                </span>
                <span>{highlight.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>© 2026 CTY Đống Đa · Bảo mật nội bộ</span>
          <div className="flex gap-4">
            <button type="button" className="cursor-pointer hover:text-white">Hỗ trợ</button>
            <button type="button" className="cursor-pointer hover:text-white">Tài liệu</button>
          </div>
        </div>
      </aside>

      <section className="flex w-full items-center justify-center bg-white px-6 py-10 lg:w-1/2 lg:px-12">
        <div className="w-full max-w-md">
          <div className="login-panel px-7 py-8 sm:px-9 sm:py-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
                <img src={businessLogoSrc} alt="CTY Đống Đa" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-950">CTY Đống Đa</div>
                <div className="text-xs text-slate-500">Hệ thống vận hành tài chính</div>
              </div>
            </div>

            <div className="mb-8">
              <Typography.Title className="!mb-0 !text-3xl !text-slate-950" level={2}>Đăng nhập</Typography.Title>
              <p className="mt-2 text-sm text-slate-500">Hệ thống xác thực tài khoản và tự phân quyền theo vai trò.</p>
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
                    <Input size="large" prefix={<UserOutlined className="text-slate-400" />} autoComplete="username" placeholder="Nhập tên đăng nhập" {...field} />
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

              <Button className="!h-12 !font-semibold" block type="primary" htmlType="submit" loading={isSubmitting}>
                Đăng nhập
              </Button>
            </Form>
          </div>
        </div>
      </section>
    </main>
  );
}
