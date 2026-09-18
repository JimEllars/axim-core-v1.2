// src/components/common/OfflineIndicator.jsx
import React from 'react';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { FiWifiOff } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const OfflineIndicator = () => {
  const { isOnline } = useConnectivity();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
        >
          <div className="glass-effect bg-onyx-950/90 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)] rounded-lg p-3 flex items-center justify-center gap-3">
            <div className="p-2 bg-red-500/20 text-red-400 rounded-lg">
              <FiWifiOff className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-red-400 font-bold text-sm uppercase tracking-wider font-mono">System Offline</h3>
              <p className="text-slate-300 text-xs">Connectivity lost. Some features may be unavailable.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
