import React, { Component } from 'react';
import logger from '../services/logging';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
    console.error("Uncaught error:", error, errorInfo);

    // Handle dynamic import chunking error explicitly
    if (error && error.name === 'TypeError' && error.message && error.message.includes('Failed to fetch dynamically imported module')) {
        console.error('Dynamically imported module failed to load in ErrorBoundary.');
        return;
    }

    // Silently transmit the error to telemetry
    setTimeout(async () => {
      try {
logger.captureException(error, errorInfo);
      } catch (err) {
        console.error("Failed to transmit error telemetry", err);
      }
    }, 100); // Brief timeout
  }

  render() {
    if (this.state.hasError) {
      if (this.state.error && this.state.error.name === 'TypeError' && this.state.error.message && this.state.error.message.includes('Failed to fetch dynamically imported module')) {
        return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
            <div className="bg-slate-800 max-w-md w-full rounded-lg p-8 text-center shadow-xl border border-slate-700">
              <h2 className="text-2xl font-semibold text-slate-200 mb-4">Network error loading this module.</h2>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded transition-colors w-full"
              >
                Reload Page
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
          <div className="bg-slate-800 max-w-md w-full rounded-lg p-8 text-center shadow-xl border border-slate-700">
            <h2 className="text-2xl font-semibold text-slate-200 mb-4">Application Error: Please check console or refresh.</h2>
            {this.state.error && (
              <div className="bg-slate-900 rounded p-4 text-left mb-6 overflow-auto max-h-40">
                <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">
                  {this.state.error.toString()}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-6 rounded transition-colors w-full"
            >
              Refresh Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
