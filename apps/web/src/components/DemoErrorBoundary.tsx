import React from 'react';

export class DemoErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div role="alert">Không thể hiển thị giao diện minh họa. Vui lòng tải lại trang.</div>;
    }
    return this.props.children;
  }
}
