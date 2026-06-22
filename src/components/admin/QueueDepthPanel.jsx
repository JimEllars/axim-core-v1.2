import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiList, FiClock, FiAlertCircle } = FiIcons;

const QueueDepthPanel = () => {
  const [queueData, setQueueData] = useState({
    pendingJobs: 0,
    deadLetters: 0,
    activeTasks: 0,
    loading: true
  });

  const fetchQueueDepth = async () => {
    try {
      const [jobsRes, dlqRes, tasksRes] = await Promise.all([
        supabase.from('satellite_job_queue').select('id', { count: 'exact', head: true }),
        supabase.from('dead_letter_jobs').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('scheduled_tasks').select('id', { count: 'exact', head: true }).eq('status', 'active')
      ]);

      setQueueData({
        pendingJobs: jobsRes.count || 0,
        deadLetters: dlqRes.count || 0,
        activeTasks: tasksRes.count || 0,
        loading: false
      });
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

  if (queueData.loading) {
    return (
      <div className="bg-onyx-950/80 rounded-xl p-6 border border-onyx-accent/30 shadow-[0_0_20px_rgba(0,0,0,0.4)] backdrop-blur-md animate-pulse mt-4">
        <div className="h-6 w-1/3 bg-slate-800 rounded mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-800 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-onyx-950/80 rounded-xl p-6 border border-onyx-accent/30 shadow-[0_0_20px_rgba(0,0,0,0.4)] backdrop-blur-md mt-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center">
          <SafeIcon icon={FiList} className="mr-2 text-indigo-400" />
          Queue & Automation Depth
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-onyx-950/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiList} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Pending Jobs</span>
          </div>
          <div className="text-2xl font-mono text-indigo-400">
            {queueData.pendingJobs}
          </div>
        </div>

        <div className="bg-onyx-950/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiClock} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Active Cron Tasks</span>
          </div>
          <div className="text-2xl font-mono text-indigo-400">
            {queueData.activeTasks}
          </div>
        </div>

        <div className="bg-onyx-950/50 p-4 rounded-lg border border-slate-800">
          <div className="flex items-center text-slate-400 mb-2">
            <SafeIcon icon={FiAlertCircle} className="mr-2" />
            <span className="text-sm uppercase tracking-wider">Dead Letters (DLQ)</span>
          </div>
          <div className={`text-2xl font-mono ${queueData.deadLetters > 0 ? 'text-red-500' : 'text-indigo-400'}`}>
            {queueData.deadLetters}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueueDepthPanel;
