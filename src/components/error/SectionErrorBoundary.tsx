import { Component, type ErrorInfo, type ReactNode } from 'react';

type SectionErrorBoundaryProps = {
  children: ReactNode;
  title: string;
};

type SectionErrorBoundaryState = {
  errorKey: number;
  hasError: boolean;
};

export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    errorKey: 0,
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Open Mail section boundary failed: ${this.props.title}`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState((current) => ({
      errorKey: current.errorKey + 1,
      hasError: false
    }));
  };

  override render() {
    if (this.state.hasError) {
      return (
        <section
          aria-label={`${this.props.title} fallback`}
          className="section-error-card"
          role="alert"
        >
          <p className="eyebrow">Section unavailable</p>
          <h3>{this.props.title}</h3>
          <p>
            This area failed to render, but the rest of Open Mail is still available.
          </p>
          <button onClick={this.handleRetry} type="button">
            Retry section
          </button>
        </section>
      );
    }

    return <div key={this.state.errorKey}>{this.props.children}</div>;
  }
}
