import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import ErrorBoundary from '../ErrorBoundary';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabaseClient';

const { FiCheck, FiX, FiDollarSign, FiClock, FiShield, FiAlertTriangle } = FiIcons;

const CFODashboard = () => {
  const { data: pendingRequests, loading, error, refetch } = useSupabaseQuery('get_cfo_pending_approvals');
  const [processingId, setProcessingId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, requestId: null, status: null, details: null });
  const { user } = useAuth();

  // Custom fetch function since we might not have a dedicated RPC for this
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);

  React.useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLogsLoading(true);
        const { data, error } = await supabase
          .from('hitl_audit_logs')
          .select('*')
          .eq('status', 'Pending')
          // Using target_department might require it to exist in the schema,
          // or we check the JSON payload. Let's try basic fetching first.
          .order('timestamp', { ascending: false });

        if (error) throw error;

        // Filter in memory if target_department isn't a direct column
        const cfoLogs = data.filter(log => {
           try {
             const payload = JSON.parse(log.tool_called || '{}');
             return payload.target_department === 'CFO' || log.target_department === 'CFO';
           } catch(e) {
             return false;
           }
        });

        // If data is empty but we want to show something for the test
        setLogs(cfoLogs);
      } catch (err) {
        setLogsError(err);
      } finally {
        setLogsLoading(false);
      }
    };
    fetchLogs();
  }, []);


  const handleApproval = async () => {
    const { requestId, status } = confirmModal;
    setProcessingId(requestId);
    setConfirmModal({ isOpen: false, requestId: null, status: null, details: null });

    try {
      await api.resolveHitlAction(requestId, status);
      toast.success(`Request ${status.toLowerCase()} successfully`);
      refetch();
      // Also update local state
      setLogs(prev => prev.filter(l => l.id !== requestId));
    } catch (err) {
      toast.error('Failed to process request: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const confirmAction = (id, status, details) => {
    setConfirmModal({ isOpen: true, requestId: id, status, details });
  };

  const displayData = pendingRequests || logs;
  const isDataLoading = loading || logsLoading;
  const dataError = error || logsError;

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex items-center space-x-4 mb-2">
          <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <SafeIcon icon={FiDollarSign} className="text-white text-2xl" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">CFO Dashboard</h1>
            <p className="text-slate-400">Financial approvals and affiliate commission management</p>
          </div>
        </div>

        <ErrorBoundary>
          <div className="bg-onyx-900/40 backdrop-blur-md rounded-2xl border border-onyx-accent/20 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-onyx-accent/20 flex justify-between items-center bg-onyx-900/60">
              <h2 className="text-xl font-bold text-white flex items-center">
                <SafeIcon icon={FiClock} className="mr-3 text-onyx-accent" />
                Pending Affiliate Commissions
              </h2>
            </div>

            <div className="p-0">
              {isDataLoading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-onyx-accent"></div>
                  <p>Loading financial requests...</p>
                </div>
              ) : dataError ? (
                <div className="p-8 text-center text-red-400 bg-red-900/10">
                  <SafeIcon icon={FiShield} className="text-4xl mx-auto mb-3 opacity-50" />
                  <p>Failed to load approval requests: {dataError.message}</p>
                </div>
              ) : !displayData || displayData.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <SafeIcon icon={FiCheck} className="text-5xl mx-auto mb-4 text-emerald-500/50" />
                  <h3 className="text-lg font-medium text-slate-300 mb-1">All clear</h3>
                  <p>No pending CFO approvals at this time.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-onyx-950/50 text-slate-300 text-sm uppercase tracking-wider border-b border-onyx-accent/10">
                        <th className="p-4 pl-6 font-medium">Request ID</th>
                        <th className="p-4 font-medium">Partner / Details</th>
                        <th className="p-4 font-medium">Commission Amount</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 pr-6 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-onyx-accent/10">
                      {displayData.map((request) => {
                        let details = request.action_required || 'Commission Approval';
                        let amount = 'N/A';
                        let partnerId = request.target_department || 'Unknown Partner';

                        try {
                          if (request.tool_called) {
                            const parsed = JSON.parse(request.tool_called);
                            if (parsed.amount) amount = `$${parseFloat(parsed.amount).toFixed(2)}`;
                            if (parsed.partner_id) partnerId = parsed.partner_id;
                            if (parsed.details) details = parsed.details;
                          }
                        } catch (e) {
                          // Ignore parse errors, use fallbacks
                        }

                        return (
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            key={request.id}
                            className="hover:bg-onyx-800/30 transition-colors"
                          >
                            <td className="p-4 pl-6 font-mono text-xs text-slate-400">
                              {request.id.substring(0, 8)}...
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-medium text-white mb-1">
                                {partnerId}
                              </div>
                              <div className="text-xs text-slate-400 line-clamp-1">
                                {details}
                              </div>
                            </td>
                            <td className="p-4 font-mono font-medium text-emerald-400">
                              {amount}
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                {request.status}
                              </span>
                            </td>
                            <td className="p-4 pr-6 text-right space-x-2">
                              <button
                                onClick={() => confirmAction(request.id, 'Approved', { partnerId, amount, details })}
                                disabled={processingId === request.id}
                                className="inline-flex items-center justify-center p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg transition-colors border border-emerald-600/30 disabled:opacity-50"
                                title="Approve"
                              >
                                {processingId === request.id ? (
                                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <SafeIcon icon={FiCheck} />
                                )}
                              </button>
                              <button
                                onClick={() => confirmAction(request.id, 'Rejected', { partnerId, amount, details })}
                                disabled={processingId === request.id}
                                className="inline-flex items-center justify-center p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors border border-red-600/30 disabled:opacity-50"
                                title="Reject"
                              >
                                <SafeIcon icon={FiX} />
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </ErrorBoundary>

        {/* Confirmation Modal */}
        <AnimatePresence>
          {confirmModal.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmModal({ isOpen: false, requestId: null, status: null, details: null })}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-onyx-900 border border-onyx-accent/20 rounded-xl shadow-2xl p-6 max-w-md w-full m-4"
              >
                <div className="flex items-start mb-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    confirmModal.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    <SafeIcon icon={FiAlertTriangle} className="text-xl" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-bold text-white">
                      Confirm {confirmModal.status === 'Approved' ? 'Approval' : 'Rejection'}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Are you sure you want to {confirmModal.status === 'Approved' ? 'approve' : 'reject'} this commission payout?
                    </p>
                  </div>
                </div>

                {confirmModal.details && (
                  <div className="bg-onyx-950 rounded-lg p-4 mb-6 border border-onyx-accent/10">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-slate-500">Partner</span>
                      <span className="text-xs font-medium text-white">{confirmModal.details.partnerId}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-slate-500">Amount</span>
                      <span className="text-xs font-medium text-emerald-400">{confirmModal.details.amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">Details</span>
                      <span className="text-xs text-slate-400 truncate max-w-[200px] text-right" title={confirmModal.details.details}>
                        {confirmModal.details.details}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setConfirmModal({ isOpen: false, requestId: null, status: null, details: null })}
                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApproval}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      confirmModal.status === 'Approved'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                    }`}
                  >
                    Confirm {confirmModal.status}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
};

export default CFODashboard;
