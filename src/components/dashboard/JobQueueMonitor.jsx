import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'N/A');

const JobQueueMonitor = () => {
  const { data: fetchedJobs = [], loading, error, refetch: fetchJobs } = useSupabaseQuery('get_satellite_job_queue', { autoFetch: true });
  const [deadLetterJobs, setDeadLetterJobs] = useState([]);
  const [deadLetterLoading, setDeadLetterLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [retryingJobId, setRetryingJobId] = useState(null);

  const jobs = fetchedJobs;

  const fetchDeadLetterJobs = useCallback(async () => {
    setDeadLetterLoading(true);
    const { data, error: deadLetterError } = await supabase
      .from('dead_letter_jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (deadLetterError) {
      toast.error(`Failed to load dead-letter jobs: ${deadLetterError.message}`);
    } else {
      setDeadLetterJobs(data ?? []);
    }
    setDeadLetterLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(fetchDeadLetterJobs, 0);
    return () => window.clearTimeout(initialLoad);
  }, [fetchDeadLetterJobs]);

  useEffect(() => {
    const activeChannel = supabase
      .channel('public:satellite_job_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'satellite_job_queue' }, fetchJobs)
      .subscribe();
    const deadLetterChannel = supabase
      .channel('public:dead_letter_jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dead_letter_jobs' }, fetchDeadLetterJobs)
      .subscribe();

    return () => {
      supabase.removeChannel(activeChannel);
      supabase.removeChannel(deadLetterChannel);
    };
  }, [fetchDeadLetterJobs, fetchJobs]);

  const handleRetryDeadLetterJob = async (jobId) => {
    setRetryingJobId(jobId);
    const { data, error: retryError } = await supabase.rpc('retry_dead_letter_job', { target_job_id: jobId });

    if (retryError) {
      toast.error(`Failed to retry job: ${retryError.message}`);
    } else if (!data) {
      toast.error('The dead-letter job could not be found.');
    } else {
      toast.success('Job returned to the active queue.');
      await Promise.all([fetchJobs(), fetchDeadLetterJobs()]);
    }
    setRetryingJobId(null);
  };

  const summary = {
    pending: jobs.filter((job) => job.status === 'pending').length,
    processing: jobs.filter((job) => job.status === 'processing').length,
    completed: jobs.filter((job) => job.status === 'completed').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
  };

  if (loading && jobs.length === 0) {
    return <div className="p-6 text-white min-h-[160px] animate-pulse rounded-2xl shadow-[0_0_25px_rgba(0,0,0,0.5)] bg-onyx-900/40 backdrop-blur-md border border-white/5">Loading job queue...</div>;
  }
  if (error) return <div className="text-red-500 p-4">Error: {error.message || String(error)}</div>;

  return (
    <div className="p-6 text-white min-h-[160px] rounded-2xl shadow-[0_0_25px_rgba(0,0,0,0.5)] bg-onyx-900/40 backdrop-blur-md border border-white/5">
      <h1 className="text-2xl font-bold mb-6 text-blue-400 border-b border-blue-900 pb-2">Mission Control: Job Queue</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending', count: summary.pending, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
          { label: 'Processing', count: summary.processing, color: 'text-blue-400', bg: 'bg-blue-900/30' },
          { label: 'Completed', count: summary.completed, color: 'text-green-400', bg: 'bg-green-900/30' },
          { label: 'Failed', count: summary.failed, color: 'text-red-400', bg: 'bg-red-900/30' },
        ].map((stat) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`p-4 rounded-lg border border-gray-700 ${stat.bg} flex flex-col items-center justify-center`}>
            <span className="text-sm text-gray-400 uppercase tracking-wider">{stat.label}</span>
            <span className={`text-3xl font-bold ${stat.color}`}>{stat.count}</span>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 mb-5 border-b border-gray-700">
        <button type="button" onClick={() => setActiveTab('active')} className={`px-4 py-2 font-medium ${activeTab === 'active' ? 'border-b-2 border-blue-400 text-blue-300' : 'text-slate-400'}`}>Active Queue</button>
        <button type="button" onClick={() => setActiveTab('dead-letter')} className={`px-4 py-2 font-medium ${activeTab === 'dead-letter' ? 'border-b-2 border-red-400 text-red-300' : 'text-slate-400'}`}>Dead Letter Queue (DLQ)</button>
      </div>

      {activeTab === 'active' ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400 uppercase text-xs"><tr><th className="px-6 py-3">ID / App</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Attempts</th><th className="px-6 py-3">Created At</th><th className="px-6 py-3">Details / Errors</th></tr></thead>
            <tbody className="divide-y divide-gray-700">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4"><div className="font-mono text-xs text-gray-400">{job.id.substring(0, 8)}...</div><div className="font-semibold mt-1 text-blue-300">{job.app_id}</div></td>
                  <td className="px-6 py-4">{job.status}</td>
                  <td className="px-6 py-4 text-gray-300">{job.attempts} / {job.max_attempts}</td>
                  <td className="px-6 py-4 text-gray-400 text-xs">{formatDate(job.created_at)}</td>
                  <td className="px-6 py-4 text-xs text-red-400">{job.error_log || 'None'}</td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No jobs found in the queue.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          {deadLetterLoading ? <p className="p-6 text-slate-400">Loading dead-letter jobs...</p> : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-900 text-gray-400 uppercase text-xs"><tr><th className="px-6 py-3">ID</th><th className="px-6 py-3">Task Type</th><th className="px-6 py-3">Error</th><th className="px-6 py-3">Failed At</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-700">
                {deadLetterJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-750 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-400">{job.id.substring(0, 8)}...</td>
                    <td className="px-6 py-4 text-blue-300">{job.task_type || 'N/A'}</td>
                    <td className="px-6 py-4 text-xs text-red-400 whitespace-pre-wrap">{job.error_log || 'No error recorded'}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">{formatDate(job.created_at)}</td>
                    <td className="px-6 py-4 text-right"><button type="button" onClick={() => handleRetryDeadLetterJob(job.id)} disabled={retryingJobId === job.id} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-3 py-1 rounded text-xs font-medium transition-colors">{retryingJobId === job.id ? 'Retrying...' : 'Retry Job'}</button></td>
                  </tr>
                ))}
                {deadLetterJobs.length === 0 && <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No dead-letter jobs found.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default JobQueueMonitor;
