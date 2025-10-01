/**
 * Error Boundary for Cloud Components
 * Prevents cloud execution errors from crashing the entire app
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface CloudErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface CloudErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class CloudErrorBoundary extends React.Component<
  CloudErrorBoundaryProps,
  CloudErrorBoundaryState
> {
  constructor(props: CloudErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CloudErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Cloud component error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });

    // Log to error tracking service if available
    if (typeof window !== 'undefined' && (window as any).errorTracker) {
      (window as any).errorTracker.captureException(error, {
        context: 'CloudExecution',
        errorInfo
      });
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 my-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                Cloud Execution Error
              </h3>
              <p className="text-sm text-red-700 mb-4">
                There was an error loading the cloud execution interface. This doesn't affect your
                other features.
              </p>

              {this.state.error && (
                <div className="bg-red-100 rounded p-3 mb-4">
                  <p className="text-xs font-mono text-red-800 break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-based error boundary wrapper for functional components
 */
export function withCloudErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props) => (
    <CloudErrorBoundary fallback={fallback}>
      <Component {...props} />
    </CloudErrorBoundary>
  );

  WrappedComponent.displayName = `withCloudErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}
