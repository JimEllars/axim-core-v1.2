import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { motion } from 'framer-motion';

const JobQueueMonitor = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('satellite_job_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;
      setJobs(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    // Optional: Set up real-time subscription
    const channel = supabase
      .channel('public:satellite_job_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'satellite_job_queue' }, fetchJobs)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleForceRetry = async (jobId) => {
    try {
      const { error: updateError } = await supabase
        .from('satellite_job_queue')
        .update({ status: 'pending', attempts: 0, error_log: null })
        .eq('id', jobId);

      if (updateError) throw updateError;
      fetchJobs(); // Refresh the list
    } catch (err) {
      alert(`Failed to retry job: ${err.message}`);
    }
  };

  const summary = {
    pending: jobs.filter(j => j.status === 'pending').length,
    processing: jobs.filter(j => j.status === 'processing').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  if (loading && jobs.length === 0) return <div className="text-white p-4">Loading Job Queue...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6 text-blue-400 border-b border-blue-900 pb-2">Mission Control: Job Queue</h1>

      {/* Summary Ribbon */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending', count: summary.pending, color: 'text-yellow-400', bg: 'bg-yellow-900/30' },
          { label: 'Processing', count: summary.processing, color: 'text-blue-400', bg: 'bg-blue-900/30' },
          { label: 'Completed', count: summary.completed, color: 'text-green-400', bg: 'bg-green-900/30' },
          { label: 'Failed', count: summary.failed, color: 'text-red-400', bg: 'bg-red-900/30' }
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg border border-gray-700 ${stat.bg} flex flex-col items-center justify-center`}
          >
            <span className="text-sm text-gray-400 uppercase tracking-wider">{stat.label}</span>
            <span className={`text-3xl font-bold ${stat.color}`}>{stat.count}</span>
          </motion.div>
        ))}
      </div>

      {/* Data Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-3">ID / App</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Attempts</th>
              <th className="px-6 py-3">Created At</th>
              <th className="px-6 py-3">Details / Errors</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {jobs.map((job) => (
              <motion.tr
                key={job.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="hover:bg-gray-750 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="font-mono text-xs text-gray-400 truncate w-32" title={job.id}>{job.id.substring(0,8)}...</div>
                  <div className="font-semibold mt-1 text-blue-300">{job.app_id}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium
                    ${job.status === 'completed' ? 'bg-green-900 text-green-300' :
                      job.status === 'failed' ? 'bg-red-900 text-red-300' :
                      job.status === 'processing' ? 'bg-blue-900 text-blue-300' :
                      'bg-yellow-900 text-yellow-300'}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300">
                  {job.attempts} / {job.max_attempts}
                </td>
                <td className="px-6 py-4 text-gray-400 text-xs">
                  {new Date(job.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-gray-400 mb-1">
                    Email: {job.payload?.customer_email || 'N/A'}
                  </div>
                  {job.error_log && (
                    <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded max-h-16 overflow-y-auto w-64">
                      {job.error_log}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {job.status === 'failed' && (
                    <button
                      onClick={() => handleForceRetry(job.id)}
                      className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                    >
                      Force Retry
                    </button>
                  )}
                </td>
              </motion.tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  No jobs found in the queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JobQueueMonitor;
