import React, { useState } from 'react';
import { motion } from 'framer-motion';

const OnyxInvestigationPanel = ({ traceHistory, semanticAnalysis, proposedPatch, onApprovePatch }) => {
  const [reviewed, setReviewed] = useState(false);

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

        {/* RCA Patch Diff Viewer (HITL) */}
        {proposedPatch && (
          <div className="bg-gray-800/50 rounded-lg p-4 border border-indigo-500/30">
            <h4 className="text-indigo-400 text-xs uppercase tracking-wider mb-2 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              Proposed RCA Patch Diff
            </h4>

            <div className="bg-black/80 rounded border border-gray-700 font-mono text-xs mb-4">
              <div className="grid grid-cols-2 border-b border-gray-700 bg-gray-900/80">
                <div className="p-2 text-gray-400 text-center border-r border-gray-700">Before</div>
                <div className="p-2 text-green-400 text-center">After</div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-700">
                <div className="p-3 overflow-x-auto text-red-300 bg-red-900/10">
                  <pre>{proposedPatch.before}</pre>
                </div>
                <div className="p-3 overflow-x-auto text-green-300 bg-green-900/10">
                  <pre>{proposedPatch.after}</pre>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 p-3 bg-gray-900 rounded border border-gray-700">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-indigo-500 rounded border-gray-600 bg-gray-800 focus:ring-indigo-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300 select-none">I have reviewed this patch</span>
              </label>

              <button
                disabled={!reviewed}
                onClick={onApprovePatch}
                className={`px-4 py-2 rounded text-sm font-semibold transition-all ${
                  reviewed
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Approve Patch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnyxInvestigationPanel;
