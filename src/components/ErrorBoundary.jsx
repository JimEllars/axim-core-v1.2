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
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-slate-900 to-slate-900 flex items-center justify-center p-4 text-white">
          <div className="glass-effect max-w-2xl w-full rounded-lg p-8 text-center border border-red-500/30">
            <h1 className="text-3xl font-bold text-red-400 mb-4">We encountered an unexpected anomaly.</h1>
            <p className="text-slate-300 mb-6">
              Onyx has been notified. The system has paused to prevent further issues. Please reload the dashboard to continue.
            </p>
            <div className="bg-onyx-950/50 border border-onyx-accent/20 rounded-md p-4 text-left mb-6 hidden">
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
                className="bg-red-600/80 hover:bg-red-500 text-white font-bold py-2 px-6 rounded transition-colors"
              >
                Safe Reload Dashboard
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
