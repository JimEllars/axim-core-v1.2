import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiDatabase, FiRefreshCw } = FiIcons;

const ManualOperations = ({ onCommand }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-effect rounded-xl p-6"
    >
      <div className="flex items-center space-x-3 mb-4">
        <SafeIcon icon={FiDatabase} className="text-blue-400 text-xl" />
        <h3 className="text-lg font-semibold text-white">Manual Operations</h3>
      </div>

      <div className="space-y-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onCommand('export chatlog', true)}
          className="w-full bg-onyx-950/50 hover:bg-onyx-accent/20 text-white py-2 px-4 rounded-lg text-sm transition-colors"
        >
          Export Chat Log
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onCommand('sync crm', true)}
          className="w-full bg-onyx-950/50 hover:bg-onyx-accent/20 text-white py-2 px-4 rounded-lg text-sm transition-colors"
        >
          Force Database Sync
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onCommand('recalculate metrics', true)}
          className="w-full bg-onyx-950/50 hover:bg-onyx-accent/20 text-white py-2 px-4 rounded-lg text-sm transition-colors"
        >
          Recalculate Metrics
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => window.location.reload()}
          className="w-full bg-onyx-950/50 hover:bg-onyx-accent/20 text-white py-2 px-4 rounded-lg text-sm transition-colors"
        >
          <SafeIcon icon={FiRefreshCw} className="inline mr-2" />
          System Refresh
        </motion.button>
      </div>
    </motion.div>
  );
};

export default ManualOperations;
