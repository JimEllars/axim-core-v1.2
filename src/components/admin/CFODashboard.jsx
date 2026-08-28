import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import ErrorBoundary from '../ErrorBoundary';
import api from '../../services/onyxAI/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const { FiCheck, FiX, FiDollarSign, FiClock, FiShield } = FiIcons;

const CFODashboard = () => {
  const { data: pendingRequests, loading, error, refetch } = useSupabaseQuery('get_cfo_pending_approvals');
  const [processingId, setProcessingId] = useState(null);
  const { user } = useAuth();

  const handleApproval = async (id, status) => {
    setProcessingId(id);
    try {
      await api.resolveHitlAction(id, status);
      toast.success(`Request ${status.toLowerCase()} successfully`);
      refetch();
    } catch (err) {
      toast.error('Failed to process request: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

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
              {loading ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-onyx-accent"></div>
                  <p>Loading financial requests...</p>
                </div>
              ) : error ? (
                <div className="p-8 text-center text-red-400 bg-red-900/10">
                  <SafeIcon icon={FiShield} className="text-4xl mx-auto mb-3 opacity-50" />
                  <p>Failed to load approval requests: {error.message}</p>
                </div>
              ) : !pendingRequests || pendingRequests.length === 0 ? (
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
                      {pendingRequests.map((request) => {
                        // Try to parse action payload for details if available
                        let details = request.action_required || 'Commission Approval';
                        let amount = 'N/A';
                        let partnerId = request.target_department; // Fallback

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
                                onClick={() => handleApproval(request.id, 'Approved')}
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
                                onClick={() => handleApproval(request.id, 'Rejected')}
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
      </motion.div>
    </div>
  );
};

export default CFODashboard;
