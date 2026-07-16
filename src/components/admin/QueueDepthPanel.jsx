import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { replayDeadLetter } from '../../services/apiClient';
import toast from 'react-hot-toast';

const { FiList, FiClock, FiAlertCircle, FiRefreshCw, FiChevronDown, FiChevronUp } = FiIcons;

const QueueDepthPanel = () => {
  const [queueData, setQueueData] = useState({
    pendingJobs: 0,
    deadLetters: 0,
    activeTasks: 0,
    criticalFailures: 0,
    loading: true
  });

  const [dlqJobs, setDlqJobs] = useState([]);
  const [emailDlqJobs, setEmailDlqJobs] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [replayingIds, setReplayingIds] = useState(new Set());

  const fetchQueueDepth = async () => {
    try {
      const [jobsRes, dlqRes, tasksRes, failuresRes, dlqListRes, emailDlqListRes] = await Promise.all([
        supabase.from('satellite_job_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('dead_letter_jobs').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('scheduled_tasks').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('telemetry_events').select('id', { count: 'exact', head: true }).eq('severity', 'FATAL'),
        supabase.from('dead_letter_jobs').select('*').eq('status', 'Pending').order('created_at', { ascending: false }).limit(10),
        supabase.from('email_dead_letter_queue').select('*').eq('status', 'Pending').order('created_at', { ascending: false }).limit(10)
      ]);

      const totalDeadLetters = (dlqRes.count || 0) + (emailDlqListRes.data?.length || 0); // Approx count for email if no count query

      setQueueData({
        pendingJobs: jobsRes.count || 0,
        deadLetters: totalDeadLetters,
        activeTasks: tasksRes.count || 0,
        criticalFailures: failuresRes.count || 0,
        loading: false
      });

      if (dlqListRes.data) setDlqJobs(dlqListRes.data);
      if (emailDlqListRes.data) setEmailDlqJobs(emailDlqListRes.data);

    } catch (err) {
      console.error('Error fetching queue depth:', err);
      setQueueData(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchQueueDepth();
    const interval = setInterval(fetchQueueDepth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleReplay = async (jobId, queueType) => {
    try {
      setReplayingIds(prev => new Set(prev).add(jobId));
      await replayDeadLetter(jobId, queueType);
      toast.success(`Successfully queued replay for job ${jobId.substring(0, 8)}`);
      await fetchQueueDepth();
    } catch (error) {
      toast.error(`Failed to replay job: ${error.message || 'Unknown error'}`);
    } finally {
      setReplayingIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  if (queueData.loading) {
    return (
      <div className="glass-effect rounded-xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.4)] animate-pulse mt-4">
        <div className="h-6 w-1/3 bg-slate-800 rounded mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="h-24 bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  const renderDlqTable = (jobs, type) => {
    if (!jobs || jobs.length === 0) return null;

    return (
      <div className="mt-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">{type === 'standard' ? 'Standard DLQ' : 'Email DLQ'}</h3>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-2">ID</th>
              <th className="p-2">Created</th>
              <th className="p-2">Error / Context</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm font-mono text-slate-300">
            {jobs.map(job => (
              <tr key={job.id} className="border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors">
                <td className="p-2 text-slate-400">{job.id.substring(0, 8)}</td>
                <td className="p-2">{new Date(job.created_at).toLocaleString()}</td>
                <td className="p-2 truncate max-w-xs text-red-400/80" title={job.error_message || job.last_error}>
                  {job.error_message || job.last_error || 'Unknown error'}
                </td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => handleReplay(job.id, type)}
                    disabled={replayingIds.has(job.id)}
                    className="inline-flex items-center px-3 py-1 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 rounded border border-indigo-500/30 transition-colors disabled:opacity-50"
                  >
                    <SafeIcon icon={FiRefreshCw} className={`mr-2 ${replayingIds.has(job.id) ? 'animate-spin' : ''}`} />
                    {replayingIds.has(job.id) ? 'Replaying...' : 'Replay'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="glass-effect rounded-xl p-6 shadow-[0_0_20px_rgba(0,0,0,0.4)] mt-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center">
          <SafeIcon icon={FiList} className="mr-2 text-indigo-400" />
          Queue & Automation Depth
        </h2>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-white transition-colors"
        >
          {isExpanded ? <SafeIcon icon={FiChevronUp} className="text-xl" /> : <SafeIcon icon={FiChevronDown} className="text-xl" />}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiList} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Pending Jobs</span>
          </div>
          <div className="text-2xl font-mono text-indigo-400">
            {queueData.pendingJobs}
          </div>
        </div>

        <div className="bg-zinc-900/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiClock} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Active Cron Tasks</span>
          </div>
          <div className="text-2xl font-mono text-indigo-400">
            {queueData.activeTasks}
          </div>
        </div>

        <div className="bg-zinc-900/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiAlertCircle} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Dead Letters (DLQ)</span>
          </div>
          <div className={`text-2xl font-mono ${queueData.deadLetters > 0 ? 'text-red-500' : 'text-indigo-400'}`}>
            {queueData.deadLetters}
          </div>
        </div>

        <div className="bg-zinc-900/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiAlertCircle} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Critical Failures</span>
          </div>
          <div className={`text-2xl font-mono ${queueData.criticalFailures > 0 ? 'text-red-500' : 'text-indigo-400'}`}>
            {queueData.criticalFailures}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (queueData.deadLetters > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 pt-4 border-t border-slate-800"
          >
            <h3 className="text-lg font-bold text-white mb-4">DLQ Operational Cockpit</h3>
            {renderDlqTable(dlqJobs, 'standard')}
            {renderDlqTable(emailDlqJobs, 'email')}
            {dlqJobs.length === 0 && emailDlqJobs.length === 0 && (
               <div className="text-slate-500 text-sm italic py-4">No pending dead letters found.</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QueueDepthPanel;
