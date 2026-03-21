import React from 'react';
import { motion } from 'framer-motion';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

const { FiUser, FiBriefcase, FiCheckSquare } = FiIcons;

const dataTypes = [
  { name: 'Consumer', icon: FiUser, description: 'Individual customer profiles.' },
  { name: 'Corporate', icon: FiBriefcase, description: 'Business or organization data.' },
  { name: 'Voter', icon: FiCheckSquare, description: 'Voter registration information.' },
];

const DataTypeSelector = ({ onSelect, selectedType }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <h3 className="text-xl font-semibold text-white mb-4">1. Select Data Type</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dataTypes.map((type) => (
          <motion.div
            key={type.name}
            whileHover={{ scale: 1.05 }}
            onClick={() => onSelect(type.name)}
            className={`glass-effect p-6 rounded-lg cursor-pointer transition-all ${
              selectedType === type.name ? 'border-2 border-blue-500 bg-blue-500/20' : 'border border-onyx-accent/20'
            }`}
          >
            <div className="flex items-center mb-2">
              <SafeIcon icon={type.icon} className="w-6 h-6 mr-3 text-blue-400" />
              <h4 className="font-bold text-lg text-white">{type.name}</h4>
            </div>
            <p className="text-slate-400 text-sm">{type.description}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default DataTypeSelector;