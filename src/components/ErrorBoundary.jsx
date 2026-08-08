import React, { Component } from 'react';
import logger from '../services/logging';
import { FiAlertTriangle } from "react-icons/fi";

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
        // We still want to log this via telemetry so we don't return here!
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
          <div className="min-h-screen bg-onyx-900 flex items-center justify-center p-4 text-white">
            <div className="glass-effect max-w-md w-full rounded-xl p-8 text-center shadow-xl border border-red-500/30">
              <FiAlertTriangle className="mx-auto text-4xl text-red-500 mb-4" />
              <h2 className="text-2xl font-semibold text-slate-200 mb-4">Network error loading this module.</h2>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50 font-medium py-2 px-6 rounded transition-colors w-full"
              >
                Reload System
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-onyx-900 flex items-center justify-center p-4 text-white">
          <div className="glass-effect max-w-md w-full rounded-xl p-8 text-center shadow-xl border border-red-500/30">
            <FiAlertTriangle className="mx-auto text-4xl text-red-500 mb-4" />
            <h2 className="text-2xl font-semibold text-slate-200 mb-4">Application Error: Please check console or refresh.</h2>
            {this.state.error && (
              <div className="bg-onyx-950/50 border border-slate-700/50 rounded p-4 text-left mb-6 overflow-auto max-h-40">
                <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">
                  {this.state.error.toString()}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50 font-medium py-2 px-6 rounded transition-colors w-full"
            >
              Reload System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;