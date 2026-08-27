import React from 'react';
import { motion } from 'framer-motion';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const AuthOffline = () => {
  const navigate = useNavigate();

  const handleRetry = () => {
    // Retry redirecting to the main entry point which will re-trigger the SSO check
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-onyx-950 via-slate-900 to-onyx-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-effect bg-onyx-950/80 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.15)] rounded-xl p-8 text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-amber-500/10 rounded-full border border-amber-500/20">
            <FiAlertTriangle className="w-12 h-12 text-amber-500 animate-pulse" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-100 mb-3 font-mono tracking-tight">
          Service Degraded
        </h1>

        <p className="text-slate-400 mb-8 leading-relaxed">
          Authentication Services are currently experiencing connectivity issues. Please try again in a few moments.
        </p>

        <button
          onClick={handleRetry}
          className="w-full flex items-center justify-center gap-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg py-3 px-4 transition-all duration-200 font-mono font-bold uppercase tracking-wider group"
        >
          <FiRefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          Retry Connection
        </button>
      </motion.div>
    </div>
  );
};

export default AuthOffline;
