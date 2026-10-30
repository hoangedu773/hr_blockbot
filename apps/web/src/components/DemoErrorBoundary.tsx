import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  failed: boolean;
  error?: Error;
}

export class DemoErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[DemoErrorBoundary] Uncaught UI error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ failed: false, error: undefined });
  };

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-foreground">Không tải được màn hình này.</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-3.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
