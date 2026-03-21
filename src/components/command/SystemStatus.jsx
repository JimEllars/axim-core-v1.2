import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiActivity } = FiIcons;

const SystemStatus = ({ stats = {} }) => {
  const apiSuccessRate = stats.apiSuccessRate ?? 0;
  const totalApiCalls = stats.totalApiCalls ?? '...';
  const activeConnections = stats.activeConnections ?? '...';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="glass-effect rounded-xl p-6"
    >
      <div className="flex items-center space-x-3 mb-4">
        <SafeIcon icon={FiActivity} className="text-green-400 text-xl" />
        <h3 className="text-lg font-semibold text-white">System Status</h3>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-300">API Success Rate</span>
            <span className="text-white">{apiSuccessRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-onyx-950 rounded-full h-2">
            <motion.div
              className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full"
              animate={{ width: `${apiSuccessRate}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-onyx-accent/20">
          <div>
            <p className="text-xs text-slate-400">API Calls (24h)</p>
            <p className="text-lg font-bold text-green-400">{totalApiCalls}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Live Connections</p>
            <p className="text-lg font-bold text-blue-400">{activeConnections}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SystemStatus;
