import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import supabaseApiService from '../../services/supabaseApiService';
import * as FiIcons from 'react-icons/fi';

const { FiZap, FiCheckCircle, FiXCircle, FiAlertTriangle, FiFilter, FiRefreshCw } = FiIcons;

const WorkflowExecutionLog = () => {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, SUCCESS, ERROR, WARN
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
    }
  }, [livePolling]);

  const getStatusIcon = (execution) => {
    if (execution.severity === 'ERROR' || execution.severity === 'FATAL') return <SafeIcon icon={FiXCircle} className="text-red-400" />;
    if (execution.severity === 'WARN') return <SafeIcon icon={FiAlertTriangle} className="text-amber-400" />;
    if (execution.severity === 'INFO' || execution.severity === 'DEBUG') return <SafeIcon icon={FiCheckCircle} className="text-emerald-400" />;

    if (!execution.data?.results) {
      return <SafeIcon icon={FiAlertTriangle} className="text-amber-400" title="Legacy Trigger or missing data" />;
    }
    const allSuccess = execution.data.results.every(r => r.success);
    return allSuccess
      ? <SafeIcon icon={FiCheckCircle} className="text-emerald-400" />
      : <SafeIcon icon={FiXCircle} className="text-red-400" />;
  };

  const getStatusPill = (execution) => {
    let statusStr = 'UNKNOWN';
    let colorClass = 'bg-slate-800 text-slate-400 border-slate-700';
    if (execution.severity === 'ERROR' || execution.severity === 'FATAL') {
      statusStr = 'ERROR'; colorClass = 'bg-red-500/10 text-red-400 border-red-500/20';
    } else if (execution.severity === 'WARN') {
      statusStr = 'WARN'; colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    } else if (execution.severity === 'INFO' || execution.severity === 'DEBUG') {
      statusStr = 'SUCCESS'; colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    } else if (execution.data?.results) {
      const allSuccess = execution.data.results.every(r => r.success);
      statusStr = allSuccess ? 'SUCCESS' : 'ERROR';
      colorClass = allSuccess ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20';
    }

    return <span className={`px-2 py-1 text-xs font-bold rounded-full border ${colorClass}`}>{statusStr}</span>;
  };

  const filteredExecutions = executions.filter(exec => {
    if (filter === 'ALL') return true;
    let isSuccess = exec.severity === 'INFO' || exec.severity === 'DEBUG' || (exec.data?.results && exec.data.results.every(r => r.success));
    let isError = exec.severity === 'ERROR' || exec.severity === 'FATAL' || (exec.data?.results && !exec.data.results.every(r => r.success));
    let isWarn = exec.severity === 'WARN';
    if (filter === 'SUCCESS') return isSuccess;
    if (filter === 'ERROR') return isError;
    if (filter === 'WARN') return isWarn;
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
               className="bg-transparent text-sm text-slate-300 font-medium focus:outline-none pr-2"
             >
               <option value="ALL">All Status</option>
               <option value="SUCCESS">Success</option>
               <option value="ERROR">Error</option>
               <option value="WARN">Warning</option>
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
              <th scope="col" className="px-6 py-3">Source</th>
              <th scope="col" className="px-6 py-3">Executed At</th>
              <th scope="col" className="px-6 py-3">Log Trace</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
            {loading && executions.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center p-8">
                  <div className="flex justify-center"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
                </td>
              </tr>
            ) : filteredExecutions.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center p-8 text-slate-500">
                  No workflow executions match the current filter.
                </td>
              </tr>
            ) : (
              filteredExecutions.map((exec) => (
                <motion.tr
                  initial={{ opacity: 0, backgroundColor: 'rgba(6, 182, 212, 0.1)' }}
                  animate={{ opacity: 1, backgroundColor: 'transparent' }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  key={exec.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-6 py-4">{getStatusPill(exec)}</td>
                  <td className="px-6 py-4 font-bold text-slate-200">{exec.component_id || exec.data?.workflow_name || 'N/A'}</td>
                  <td className="px-6 py-4 text-slate-400 font-mono text-xs">{exec.severity || exec.source || 'N/A'}</td>
                  <td className="px-6 py-4 text-slate-400 whitespace-nowrap">{format(new Date(exec.created_at), 'MMM d, HH:mm:ss')}</td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-mono bg-slate-950 text-slate-300 p-2 rounded border border-slate-800/50 max-h-20 overflow-y-auto">
                       {exec.message || exec.data?.details || (exec.data?.results && `${exec.data.results.filter(r => r.success).length}/${exec.data.results.length} steps succeeded`) || 'N/A'}
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkflowExecutionLog;
