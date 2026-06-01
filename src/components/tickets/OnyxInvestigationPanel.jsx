import React from 'react';
import { motion } from 'framer-motion';

const OnyxInvestigationPanel = ({ traceHistory, semanticAnalysis }) => {
  return (
    <div className="bg-gray-900 border border-indigo-900/50 rounded-xl overflow-hidden shadow-2xl">
      <div className="bg-indigo-950/40 border-b border-indigo-900/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          <span className="text-indigo-300 font-mono text-sm font-semibold tracking-wider">Onyx Mk3 RCA Engine</span>
        </div>
        <span className="text-gray-500 text-xs font-mono">Vector KB Connected</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Semantic Analysis Block */}
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-2">Semantic Diagnosis</h4>
          <p className="text-gray-200 text-sm leading-relaxed">
            {semanticAnalysis || "Analyzing incident telemetry against known historical vectors..."}
          </p>
        </div>

        {/* Trace History Block */}
        <div>
          <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-2">Terminal Execution Trace</h4>
          <div className="bg-black/60 rounded-lg p-4 border border-gray-800 max-h-64 overflow-y-auto">
            {traceHistory ? (
              <pre className="text-red-400 font-mono text-xs whitespace-pre-wrap break-words">
                {typeof traceHistory === 'object' ? JSON.stringify(traceHistory, null, 2) : traceHistory}
              </pre>
            ) : (
              <div className="text-gray-600 font-mono text-xs text-center py-4">Waiting for trace ingress...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnyxInvestigationPanel;
