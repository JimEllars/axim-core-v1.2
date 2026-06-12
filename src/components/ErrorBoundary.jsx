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
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
    console.error("Uncaught error:", error, errorInfo);

    // Handle dynamic import chunking error explicitly
    if (error && error.name === 'TypeError' && error.message && error.message.includes('Failed to fetch dynamically imported module')) {
        console.error('Dynamically imported module failed to load in ErrorBoundary. Reloading the page...');
        window.location.reload();
        return;
    }

    // Silently transmit the error to telemetry
    setTimeout(async () => {
      try {
        const payload = {
          event: "frontend_uncaught_error",
          app_type: "axim-core-frontend",
          details: {
            error: error.toString(),
            componentStack: errorInfo.componentStack,
            userAgent: navigator.userAgent
          }
        };

        const apiUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://api.axim.us.com';
        await fetch(`${apiUrl}/functions/v1/telemetry-archiver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error("Failed to transmit error telemetry", err);
      }
    }, 100); // Brief timeout
  }

  render() {
    if (this.state.hasError) {
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
