import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiRefreshCw, FiX } from 'react-icons/fi';
import { apiProxy } from '../../services/apiProxy';

const DegradedModeAlert = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleDegraded = () => setIsVisible(true);
    const handleHealthy = () => setIsVisible(false);

    window.addEventListener('edge:degraded', handleDegraded);
    window.addEventListener('edge:healthy', handleHealthy);

    return () => {
      window.removeEventListener('edge:degraded', handleDegraded);
      window.removeEventListener('edge:healthy', handleHealthy);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await apiProxy.get('/jules/sessions?pageSize=1');
      // If the proxy responds successfully, it will dispatch edge:healthy
      // which will close this alert automatically via the event listener.
    } catch (e) {
      console.error('Retry failed', e);
      // Let it remain visible.
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-4"
        >
          <div className="glass-effect bg-onyx-950/90 border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)] rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <FiAlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-amber-400 font-bold text-sm uppercase tracking-wider font-mono">Cloudflare Edge Degraded</h3>
                <p className="text-slate-300 text-xs">Operating via Direct Gateway Fallback</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                <FiRefreshCw className={isRetrying ? "animate-spin" : ""} />
                Retry Edge Connection
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                aria-label="Dismiss alert"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DegradedModeAlert;
