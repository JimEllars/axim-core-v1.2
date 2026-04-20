import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../services/supabaseClient';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';

const { FiX, FiCheckCircle, FiClock } = FiIcons;

const ApprovalQueue = ({ isOpen, onClose, pendingLogs, setPendingLogs }) => {
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel('public:hitl_audit_logs');

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs', filter: "status=eq.pending" },
      (payload) => {
        setPendingLogs((prev) => {
          if (!prev.find(log => log.id === payload.new.id)) {
            return [payload.new, ...prev];
          }
          return prev;
        });
      }
    ).on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'hitl_audit_logs', filter: "status=eq.pending" },
      (payload) => {
        setPendingLogs((prev) => {
          const index = prev.findIndex(log => log.id === payload.new.id);
          if (index !== -1) {
            const newLogs = [...prev];
            newLogs[index] = payload.new;
            return newLogs;
          }
          return prev;
        });
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setPendingLogs]);

  if (!isOpen) return null;

    const handleApprove = async (logId, actionPayload) => {
    try {
      // Optimistic update
      setPendingLogs((prev) => prev.filter((log) => log.id !== logId));

      await api.resolveHitlAction(logId, 'Approved', actionPayload);

      toast.success('Action approved and dispatched.');
    } catch (err) {
      toast.error(`Failed to approve action: ${err.message}`);
      // Fallback: restore on fail
      const data = await api.getHitlAuditLog(logId);
      if (data) setPendingLogs((prev) => [data, ...prev]);
    }
  };

  const handleReject = async (logId) => {
    try {
      setPendingLogs((prev) => prev.filter((log) => log.id !== logId));

      await api.resolveHitlAction(logId, 'Rejected');

      toast.success('Action rejected.');
    } catch (err) {
      toast.error(`Failed to reject action: ${err.message}`);
      const data = await api.getHitlAuditLog(logId);
      if (data) setPendingLogs((prev) => [data, ...prev]);
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
