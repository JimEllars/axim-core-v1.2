import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import SafeIcon from '../../common/SafeIcon';
import supabaseApiService from '../../services/supabaseApiService';
import * as FiIcons from 'react-icons/fi';

const { FiZap, FiCheckCircle, FiXCircle, FiAlertTriangle, FiFilter, FiRefreshCw } = FiIcons;

const STATUS_STYLES = {
  completed: { label: 'SUCCESS', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: FiCheckCircle, iconClass: 'text-emerald-400' },
  failed: { label: 'FAILED', className: 'bg-red-500/10 text-red-400 border-red-500/20', icon: FiXCircle, iconClass: 'text-red-400' },
  unknown: { label: 'UNKNOWN', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: FiAlertTriangle, iconClass: 'text-amber-400' },
};

const statusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.unknown;

/** Human detail line for a run: the abort reason when it failed, else step counts. */
const describeRun = (execution) => {
  if (execution.status === 'failed' && execution.error_message) {
    return execution.error_message;
  }
  if (execution.steps_total > 0) {
    return `${execution.steps_succeeded}/${execution.steps_total} steps succeeded`;
  }
  if (execution.error_message) return execution.error_message;
  return execution.source === 'events_ax2024'
    ? 'Legacy event with no step detail'
    : 'No step detail recorded';
};

const formatDuration = (durationMs) => {
  if (!Number.isFinite(durationMs)) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  // Round to the nearest 100ms; 1450 must read as 1.5s, not the 1.4s that
  // (1450 / 1000).toFixed(1) produces through binary rounding.
  return `${(Math.round(durationMs / 100) / 10).toFixed(1)}s`;
};

const WorkflowExecutionLog = () => {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, SUCCESS, ERROR, UNKNOWN
  const [livePolling, setLivePolling] = useState(true);

  useEffect(() => {
    if (!livePolling) return;
    const handleNewExecution = (e) => {
      setExecutions(prev => [e.detail, ...prev].slice(0, 100));
    };
    window.addEventListener('workflow:new_execution', handleNewExecution);
    return () => window.removeEventListener('workflow:new_execution', handleNewExecution);
  }, [livePolling]);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const data = await supabaseApiService.getWorkflowExecutions();
      setExecutions(data || []);
    } catch (error) {
      console.error("Error fetching workflow executions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    let interval;
    if (livePolling) {
       interval = setInterval(fetchExecutions, 15000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [livePolling]);

  const filteredExecutions = executions.filter(exec => {
    if (filter === 'ALL') return true;
    if (filter === 'SUCCESS') return exec.status === 'completed';
    if (filter === 'ERROR') return exec.status === 'failed';
    if (filter === 'UNKNOWN') return exec.status === 'unknown';
    return true;
  });

  return (
    <div className="bg-slate-900/80 rounded-xl border border-slate-700/50 shadow-lg min-h-[160px] overflow-hidden">
      <div className="p-5 border-b border-slate-700/50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center">
          <SafeIcon icon={FiZap} className="mr-3 text-cyan-400" />
          Workflow Execution Log
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700/50">
             <SafeIcon icon={FiFilter} className="text-slate-400 ml-2 w-4 h-4" />
             <select
               value={filter}
               onChange={(e) => setFilter(e.target.value)}
               aria-label="Filter by status"
               className="bg-transparent text-sm text-slate-300 font-medium focus:outline-none pr-2"
             >
               <option value="ALL">All Status</option>
               <option value="SUCCESS">Success</option>
               <option value="ERROR">Failed</option>
               <option value="UNKNOWN">Unknown</option>
             </select>
          </div>
          <button
             onClick={() => setLivePolling(!livePolling)}
             className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${livePolling ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
          >
             <SafeIcon icon={FiRefreshCw} className={livePolling ? 'animate-spin-slow' : ''} />
             {livePolling ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 border-b border-slate-700/50">
            <tr>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Workflow</th>
              <th scope="col" className="px-6 py-3">Run</th>
              <th scope="col" className="px-6 py-3">Duration</th>
              <th scope="col" className="px-6 py-3">Executed At</th>
              <th scope="col" className="px-6 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
            {loading && executions.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center p-8">
                  <div className="flex justify-center"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
                </td>
              </tr>
            ) : filteredExecutions.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center p-8 text-slate-500">
                  No workflow executions match the current filter.
                </td>
              </tr>
            ) : (
              filteredExecutions.map((exec) => {
                const style = statusStyle(exec.status);
                return (
                  <motion.tr
                    initial={{ opacity: 0, backgroundColor: 'rgba(6, 182, 212, 0.1)' }}
                    animate={{ opacity: 1, backgroundColor: 'transparent' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    key={exec.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-2">
                        <SafeIcon icon={style.icon} className={style.iconClass} />
                        <span className={`px-2 py-1 text-xs font-bold rounded-full border ${style.className}`}>
                          {style.label}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-200">{exec.workflow_name}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                      {exec.workflow_run_id ? String(exec.workflow_run_id).slice(0, 8) : '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">{formatDuration(exec.duration_ms)}</td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                      {exec.created_at ? format(new Date(exec.created_at), 'MMM d, HH:mm:ss') : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className={`text-xs font-mono p-2 rounded border max-h-20 overflow-y-auto ${
                          exec.status === 'failed'
                            ? 'bg-red-950/40 text-red-200 border-red-900/50'
                            : 'bg-slate-950 text-slate-300 border-slate-800/50'
                        }`}
                      >
                         {describeRun(exec)}
                      </div>
                    </td>
                  </motion.tr>
                );
              })
            )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkflowExecutionLog;
