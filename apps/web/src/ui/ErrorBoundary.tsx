import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error('Zwaggen crashed:', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-slate-900">
        <div className="max-w-xl rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-red-700">Zwaggen crashed</h1>
          <p className="mt-2 text-sm text-slate-600">
            Something unexpected happened. Your spec is still saved in this browser's IndexedDB,
            so reloading the page will restore it.
          </p>
          <pre className="mt-3 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-700">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button type="button" className="btn" onClick={this.reset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
