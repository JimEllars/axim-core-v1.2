import React from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';

const { FiZap, FiCheckCircle, FiXCircle, FiClock, FiRefreshCw } = FiIcons;

const RecentWorkflows = () => {
  const { data: workflows, loading, isRefetching } = useSupabaseQuery('get_recent_workflow_runs');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect p-6 rounded-xl min-h-[160px]" style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-bold text-white">Recent Workflows</h3>
          {isRefetching && <SafeIcon icon={FiRefreshCw} className="animate-spin text-slate-400" />}
        </div>
        <SafeIcon icon={FiZap} className="text-yellow-400" />
      </div>
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center justify-between p-3 bg-onyx-950/50 rounded-lg">
                <div className="flex flex-col space-y-2">
                  <div className="h-4 bg-onyx-800 rounded w-32"></div>
                  <div className="h-3 bg-onyx-800 rounded w-24"></div>
                </div>
                <div className="h-4 bg-onyx-800 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="glass-effect p-8 rounded-xl border border-dashed border-onyx-accent/40 text-center flex flex-col items-center justify-center">
            <SafeIcon icon={FiClock} className="text-slate-500 text-3xl mb-3" />
            <p className="text-slate-400 font-medium">No recent workflows executed</p>
          </div>
        ) : (
          workflows.map((flow, index) => (
            <div key={index} data-testid="workflow-item" className="flex items-center justify-between p-3 bg-onyx-950/50 rounded-lg">
              <div>
                <p className="font-semibold text-white">{flow.data?.workflow_name || 'Unknown Workflow'}</p>
                <p className="text-xs text-slate-400 flex items-center">
                  <SafeIcon icon={FiClock} className="mr-1" />
                  {formatDistanceToNow(new Date(flow.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {flow.data?.results?.every(r => r.success) ? (
                  <SafeIcon icon={FiCheckCircle} className="text-green-500" data-testid="success-icon" />
                ) : (
                  <SafeIcon icon={FiXCircle} className="text-red-500" data-testid="failure-icon" />
                )}
                <span className="text-sm font-medium text-slate-300">
                  {flow.data?.results?.filter(r => r.success).length || 0}/{flow.data?.results?.length || 0} Steps
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

export default RecentWorkflows;
