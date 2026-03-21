import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiLogOut, FiActivity, FiShield } = FiIcons;

const Header = () => {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect border-b border-onyx-accent/20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <SafeIcon icon={FiShield} className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Axim Core</h1>
                <p className="text-xs text-slate-400">Operations Dashboard v1.1</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-green-400">
              <SafeIcon icon={FiActivity} className="animate-pulse" />
              <span className="text-sm font-medium">System Online</span>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 rounded-lg transition-colors"
            >
              <SafeIcon icon={FiLogOut} className="text-slate-300" />
              <span className="text-sm text-slate-300">Logout</span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;