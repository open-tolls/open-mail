import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Open Mail global boundary captured an error', error, errorInfo);
  }

  private handleReload = () => {
    window.location.assign('/');
  };

  override render() {
    if (this.state.error) {
      return (
        <main className="app-error-screen" aria-label="Open Mail error screen">
          <div className="app-error-card" role="alert">
            <p className="eyebrow">Open Mail</p>
            <h1>Something went wrong</h1>
            <p>
              The app hit an unexpected problem. You can reload now and keep working from the last
              local state.
            </p>
            <button onClick={this.handleReload} type="button">
              Reload app
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
