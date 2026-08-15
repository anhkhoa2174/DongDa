import { ArrowLeftOutlined, SafetyOutlined } from '@ant-design/icons';
import { App, Button, Card, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const OTP_LENGTH = 6;

export function TwoFactorPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [countdown, setCountdown] = useState(30);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (countdown === 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  function setChar(i: number, ch: string) {
    if (ch && !/^\d$/.test(ch)) return;
    const next = [...code];
    next[i] = ch;
    setCode(next);
    if (ch && i < OTP_LENGTH - 1) inputsRef.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[i] && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) inputsRef.current[i + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted.length === OTP_LENGTH) {
      setCode(pasted.split(''));
      inputsRef.current[OTP_LENGTH - 1]?.focus();
    }
  }

  const filled = code.every((c) => c !== '');

  async function submit() {
    if (!filled) {
      await message.warning('Vui lòng nhập đủ 6 số');
      return;
    }
    await message.success('Xác thực thành công');
    setTimeout(() => navigate('/'), 800);
  }

  function resend() {
    setCountdown(30);
    message.info('Đã gửi lại mã OTP');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 text-2xl">
            <SafetyOutlined />
          </div>
          <Typography.Title level={2} className="m-0!">Xác thực 2 lớp</Typography.Title>
          <Typography.Text type="secondary">
            Nhập mã 6 số từ Google Authenticator hoặc SMS gửi đến <span className="font-medium">****1234</span>
          </Typography.Text>
        </div>

        <div className="flex justify-between gap-2 mb-6">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (inputsRef.current[i] = el)}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => setChar(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
              className={`w-12 h-16 text-center text-2xl font-semibold rounded-lg border-2 outline-none transition ${
                digit ? 'border-blue-500 bg-blue-50' : 'border-slate-200 focus:border-blue-500'
              }`}
              style={{ fontFamily: 'monospace' }}
            />
          ))}
        </div>

        <Button type="primary" size="large" block onClick={submit} disabled={!filled}>
          Xác thực & Đăng nhập
        </Button>

        <div className="text-center mt-4 text-sm">
          <Space>
            <Typography.Text type="secondary">Không nhận được mã?</Typography.Text>
            {countdown > 0 ? (
              <Typography.Text type="secondary">Gửi lại sau <b>{countdown}</b>s</Typography.Text>
            ) : (
              <Button type="link" onClick={resend} className="p-0!">Gửi lại</Button>
            )}
          </Space>
        </div>

        <Button
          type="link"
          block
          className="mt-4"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/login')}
        >
          Quay lại đăng nhập
        </Button>
      </Card>
    </div>
  );
}
