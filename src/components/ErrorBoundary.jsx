import React, { Component } from 'react';
import logger from '../services/logging';
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import { motion } from 'framer-motion';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
    console.error("Uncaught error:", error, errorInfo);

    // Handle dynamic import chunking error explicitly
    if (error && error.name === 'TypeError' && error.message && error.message.includes('Failed to fetch dynamically imported module')) {
        console.error('Dynamically imported module failed to load in ErrorBoundary.');
    }

    // Capture the exception correctly without using an effect
    try {
      logger.captureException(error, errorInfo);
    } catch (err) {
      console.error("Failed to transmit error telemetry", err);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Reload if the user opts for a hard reset
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error && this.state.error.name === 'TypeError' && this.state.error.message && this.state.error.message.includes('Failed to fetch dynamically imported module');

      return (
        <div className="min-h-screen bg-onyx-950 flex flex-col items-center justify-center p-6 text-slate-200">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="glass-effect max-w-lg w-full rounded-2xl p-8 shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-red-500/30 flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(transparent_50%,rgba(239,68,68,1)_50%)] bg-[length:100%_4px]" />

            <div className="p-4 bg-red-500/10 rounded-full mb-6 border border-red-500/20">
              <FiAlertTriangle className="text-5xl text-red-400 animate-pulse" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
              {isChunkError ? 'Network Connection Lost' : 'System Exception Detected'}
            </h2>

            <p className="text-slate-400 text-sm mb-6 max-w-md">
              {isChunkError
                ? 'A required module failed to load due to a network interruption. Please check your connection and reload the system.'
                : 'The application encountered an unexpected runtime error. Telemetry has been dispatched to Onyx.'}
            </p>

            {this.state.error && !isChunkError && (
              <div className="w-full bg-black/40 border border-slate-700/50 rounded-lg p-4 text-left mb-8 overflow-auto max-h-48 custom-scrollbar">
                <pre className="text-[10px] text-red-300 font-mono whitespace-pre-wrap break-words">
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full group flex items-center justify-center gap-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 font-bold py-3 px-6 rounded-lg transition-all"
            >
              <FiRefreshCw className="group-hover:rotate-180 transition-transform duration-500" />
              Reinitialize System
            </button>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
