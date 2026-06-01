import React from 'react';
import { motion } from 'framer-motion';

const DatabaseUplinkError = ({ node, incident }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 bg-gray-900 border border-red-800 rounded-lg shadow-lg flex flex-col items-center justify-center text-center space-y-4"
    >
      <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mb-2">
        <svg
          className="w-8 h-8 text-red-500 animate-pulse"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          ></path>
        </svg>
      </div>

      <h3 className="text-xl font-bold text-white">System Quarantine Active</h3>

      <p className="text-gray-400 max-w-md">
        The connection to <span className="text-blue-400 font-mono">{node?.app_name || 'this micro-service'}</span> has been safely isolated.
        Our automated telemetry detected an execution anomaly.
      </p>

      {incident && (
        <div className="bg-red-950/40 border border-red-900/50 rounded-md p-4 mt-4 w-full text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-400 text-xs font-bold uppercase tracking-wider">Active Incident</span>
            <span className="bg-red-900 text-red-200 text-xs px-2 py-0.5 rounded font-mono">
              {incident.status || 'Pending_Review'}
            </span>
          </div>
          <div className="font-mono text-xs text-red-300 break-words">
            {incident.subject || 'Automated RCA: Critical Anomaly Detected'}
          </div>
          {incident.description && (
             <div className="text-gray-500 text-xs mt-2 font-mono">
               {incident.description}
             </div>
          )}
        </div>
      )}

      <div className="mt-6 flex space-x-4">
        <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded transition-colors"
                onClick={() => window.location.reload()}>
          Retry Connection
        </button>
      </div>
    </motion.div>
  );
};

export default DatabaseUplinkError;
