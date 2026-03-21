import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-slate-900 to-slate-900 flex items-center justify-center p-4 text-white">
          <div className="glass-effect max-w-2xl w-full rounded-lg p-8 text-center">
            <h1 className="text-3xl font-bold text-red-400 mb-4">Application Error</h1>
            <p className="text-slate-300 mb-6">
              A critical error occurred, and the application cannot continue. Please refresh the page or contact support if the problem persists.
            </p>
            <div className="bg-onyx-950/50 border border-onyx-accent/20 rounded-md p-4 text-left mb-6">
              <details>
                <summary className="cursor-pointer text-slate-400 hover:text-white">
                  Error Details
                </summary>
                <pre className="text-sm text-slate-400 whitespace-pre-wrap mt-2 font-mono">
                  {this.state.error && this.state.error.toString()}
                </pre>
              </details>
            </div>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(this.state.error.toString());
                  alert('Error details copied to clipboard!');
                }}
                className="bg-onyx-950 hover:bg-onyx-accent/10 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Copy Details
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
