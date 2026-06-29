// LoginPage
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin } from '@application/hooks/useAuth';

const schema = z.object({
  username: z.string().min(1, 'Nhập tên đăng nhập'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const login = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">Đ</div>
          <div>
            <div className="font-semibold text-gray-900">CTY Đống Đa</div>
            <div className="text-xs text-gray-500">Hệ thống Quản lý Quỹ WU</div>
          </div>
        </div>

        <form onSubmit={handleSubmit((data) => login.mutate(data))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên đăng nhập
            </label>
            <input
              {...register('username')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="username"
              autoComplete="username"
            />
            {errors.username && (
              <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mật khẩu
            </label>
            <input
              {...register('password')}
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {login.isError && (
            <p className="text-red-500 text-sm text-center">
              Tên đăng nhập hoặc mật khẩu không đúng
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
