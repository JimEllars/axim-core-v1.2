import React from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { useSupabaseQuery } from '../../hooks/useSupabaseQuery';

const { FiZap, FiCheckCircle, FiXCircle, FiClock } = FiIcons;

const RecentWorkflows = () => {
  const { data: workflows, loading } = useSupabaseQuery('get_recent_workflow_runs');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect p-6 rounded-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">Recent Workflows</h3>
        <SafeIcon icon={FiZap} className="text-yellow-400" />
      </div>
      <div className="space-y-4">
        {loading ? (
          <p className="text-slate-400">Loading workflows...</p>
        ) : workflows.length === 0 ? (
          <p className="text-slate-400">No recent workflow executions found.</p>
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