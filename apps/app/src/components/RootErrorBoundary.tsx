/**
 * Root Error Boundary
 * Catches all errors during app initialization and runtime
 * Provides mobile-friendly error UI
 */

import React from 'react';
import { AlertTriangle, RefreshCw, MessageCircle } from 'lucide-react';

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorDetails: string;
}

export class RootErrorBoundary extends React.Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorDetails: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    // Log to localStorage for debugging on mobile
    try {
      const errorLog = {
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        userAgent: navigator.userAgent
      };
      localStorage.setItem('vyx_last_error', JSON.stringify(errorLog));
    } catch (e) {
      console.error('Failed to log error to localStorage:', e);
    }

    return {
      hasError: true,
      error,
      errorDetails: error.message
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Root error boundary caught error:', error, errorInfo);

    // Detailed error information
    let errorDetails = error.message;

    // Detect specific error types
    if (error.message.includes('SharedArrayBuffer')) {
      errorDetails = 'Your browser doesn\'t support required features for this app. Please try:\n\n' +
        '• Using Chrome or Firefox on desktop\n' +
        '• Updating your browser to the latest version\n' +
        '• Enabling JavaScript and site permissions';
    }

    this.setState({
      error,
      errorInfo,
      errorDetails
    });
  }

  handleReset = (): void => {
    // Clear error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorDetails: ''
    });

    // Clear localStorage error log
    try {
      localStorage.removeItem('vyx_last_error');
    } catch (e) {
      console.error('Failed to clear error log:', e);
    }

    // Reload the page
    window.location.reload();
  };

  handleReportIssue = (): void => {
    // Get error details from localStorage
    const errorLog = localStorage.getItem('vyx_last_error');
    const details = errorLog ? JSON.parse(errorLog) : {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      userAgent: navigator.userAgent
    };

    // Create GitHub issue URL with pre-filled details
    const title = encodeURIComponent(`Mobile error: ${details.message}`);
    const body = encodeURIComponent(
      `## Error Details\n\n` +
      `**Browser:** ${details.userAgent}\n` +
      `**Timestamp:** ${details.timestamp || new Date().toISOString()}\n` +
      `**Error Message:** ${details.message}\n\n` +
      `### Stack Trace\n\`\`\`\n${details.stack || 'N/A'}\n\`\`\``
    );

    const issueUrl = `https://github.com/tomkanjam/vyx/issues/new?title=${title}&body=${body}`;
    window.open(issueUrl, '_blank');
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gray-800 border border-red-500/30 rounded-lg p-6">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-xl font-bold text-gray-100 text-center mb-2">
              Something went wrong
            </h1>

            {/* Error message */}
            <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-300 whitespace-pre-line">
                {this.state.errorDetails}
              </p>
            </div>

            {/* Technical details (collapsed) */}
            {this.state.error && (
              <details className="mb-4">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300 mb-2">
                  Technical Details
                </summary>
                <div className="bg-gray-900/50 rounded p-3">
                  <p className="text-xs font-mono text-gray-400 break-all">
                    {this.state.error.stack}
                  </p>
                </div>
              </details>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>

              <button
                onClick={this.handleReportIssue}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Report Issue
              </button>
            </div>

            {/* Browser info */}
            <div className="mt-4 pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-500 text-center">
                Browser: {navigator.userAgent.split(' ').slice(-2).join(' ')}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
