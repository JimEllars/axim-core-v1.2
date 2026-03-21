import React from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiZap } = FiIcons;

const WorkflowTriggers = ({ onSetInput }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-effect rounded-xl p-6"
    >
      <div className="flex items-center space-x-3 mb-4">
        <SafeIcon icon={FiZap} className="text-yellow-400 text-xl" />
        <h3 className="text-lg font-semibold text-white">Workflow Triggers</h3>
      </div>

      <div className="space-y-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSetInput('trigger transcription sprint')}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white py-2 px-4 rounded-lg text-sm transition-all"
        >
          Transcription Sprint
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSetInput('trigger axim project initiation')}
          className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white py-2 px-4 rounded-lg text-sm transition-all"
        >
          Axim Project Initiation
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSetInput('trigger lead nurture')}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white py-2 px-4 rounded-lg text-sm transition-all"
        >
          Lead Nurture Sequence
        </motion.button>
      </div>
    </motion.div>
  );
};

export default WorkflowTriggers;
