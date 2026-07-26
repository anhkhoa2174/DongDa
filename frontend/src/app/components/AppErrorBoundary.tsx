import { Button, Result } from 'antd';
import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled app error', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Result
          status="500"
          title="Ứng dụng gặp lỗi"
          subTitle="Vui lòng tải lại trang. Nếu lỗi tiếp tục xảy ra, liên hệ quản trị hệ thống."
          extra={<Button type="primary" onClick={() => window.location.reload()}>Tải lại</Button>}
        />
      );
    }

    return this.props.children;
  }
}
