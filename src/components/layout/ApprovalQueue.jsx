import React from 'react';
import { motion } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../services/supabaseClient';
import toast from 'react-hot-toast';

const { FiX, FiCheckCircle, FiClock } = FiIcons;

const ApprovalQueue = ({ isOpen, onClose, pendingLogs, setPendingLogs }) => {
  if (!isOpen) return null;

  const handleApprove = async (logId, actionPayload) => {
    try {
      // Optimistic update
      setPendingLogs((prev) => prev.filter((log) => log.id !== logId));

      const { error: updateError } = await supabase
        .from('hitl_audit_logs')
        .update({ status: 'Approved' })
        .eq('id', logId);

      if (updateError) throw updateError;

      // Ensure Onyx acts upon the approved action.
      // If it's a quarantine, trigger the backend.
      if (actionPayload && actionPayload.action === 'quarantine_app') {
        const { error: appError } = await supabase
          .from('ecosystem_apps')
          .update({ is_active: false })
          .eq('app_id', actionPayload.target);
        if (appError) throw appError;
      }

      toast.success('Action approved and dispatched.');
    } catch (err) {
      toast.error(`Failed to approve action: ${err.message}`);
      // Fallback: restore on fail
      const { data } = await supabase.from('hitl_audit_logs').select('*').eq('id', logId).single();
      if (data) setPendingLogs((prev) => [data, ...prev]);
    }
  };

  const handleReject = async (logId) => {
    try {
      setPendingLogs((prev) => prev.filter((log) => log.id !== logId));

      const { error: updateError } = await supabase
        .from('hitl_audit_logs')
        .update({ status: 'Rejected' })
        .eq('id', logId);

      if (updateError) throw updateError;

      toast.success('Action rejected.');
    } catch (err) {
      toast.error(`Failed to reject action: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md h-full bg-onyx-950 border-l border-onyx-accent/20 shadow-2xl overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-white flex items-center">
              <SafeIcon icon={FiClock} className="mr-2 text-onyx-accent" />
              Approval Queue
            </h2>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors"
            >
              <SafeIcon icon={FiX} />
            </button>
          </div>

          <div className="space-y-4">
            {pendingLogs.length === 0 ? (
              <p className="text-slate-400 text-sm">No pending actions.</p>
            ) : (
              pendingLogs.map((log) => {
                let parsedPayload = null;
                try {
                  parsedPayload = log.tool_called ? JSON.parse(log.tool_called) : null;
                } catch (e) {
                  // Ignore parse errors
                }

                return (
                  <div key={log.id} className="bg-onyx-900 border border-onyx-accent/20 p-4 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-semibold text-white">{log.action}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {parsedPayload && parsedPayload.description && (
                      <p className="text-xs text-slate-400 mb-4">{parsedPayload.description}</p>
                    )}
                    {parsedPayload && parsedPayload.target && (
                      <p className="text-xs text-slate-400 mb-4">Target: {parsedPayload.target}</p>
                    )}
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleReject(log.id)}
                        className="px-3 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(log.id, parsedPayload)}
                        className="flex items-center px-3 py-1 bg-onyx-accent/20 text-onyx-accent border border-onyx-accent/50 hover:bg-onyx-accent hover:text-onyx-950 rounded text-xs transition-colors"
                      >
                        <SafeIcon icon={FiCheckCircle} className="mr-1" />
                        Approve
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ApprovalQueue;
