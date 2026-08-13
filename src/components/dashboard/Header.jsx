import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiLogOut, FiActivity, FiShield, FiCpu, FiAlertTriangle } = FiIcons;

const Header = () => {
  const { logout } = useAuth();
  const { edgeCapacity, edgeDegraded } = useConnectivity();
  const { connectionError } = useSupabase();

  let globalHealth = 'OPERATIONAL';
  if (connectionError) {
    globalHealth = 'OFFLINE';
  } else if (edgeDegraded) {
    globalHealth = 'DEGRADED';
  }

  const handleLogout = () => {
    logout();
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect border-b border-onyx-accent/20 sticky top-0 z-40 bg-onyx-950/80 backdrop-blur-lg shadow-sm"
    >
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-inner border border-white/10">
                <SafeIcon icon={FiShield} className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight leading-none">AXiM Core</h1>
                <p className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Operations Dashboard v1.2</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">

            {globalHealth === 'OPERATIONAL' && (
              <div className="hidden md:flex items-center space-x-2 text-emerald-400 bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-500/30 shadow-sm">
                <SafeIcon icon={FiActivity} className="animate-pulse" />
                <span className="text-xs font-mono font-bold tracking-wider">SYSTEM OPERATIONAL</span>
              </div>
            )}
            {globalHealth === 'DEGRADED' && (
              <div className="flex items-center space-x-2 text-amber-400 bg-amber-900/20 px-3 py-1.5 rounded-full border border-amber-500/30 shadow-sm">
                <SafeIcon icon={FiAlertTriangle} className="animate-pulse" />
                <span className="text-xs font-mono font-bold tracking-wider">EDGE DEGRADED</span>
              </div>
            )}
            {globalHealth === 'OFFLINE' && (
              <div className="flex items-center space-x-2 text-rose-400 bg-rose-900/20 px-3 py-1.5 rounded-full border border-rose-500/30 shadow-sm">
                <SafeIcon icon={FiAlertTriangle} className="animate-pulse" />
                <span className="text-xs font-mono font-bold tracking-wider">DATABASE DEGRADED</span>
              </div>
            )}
            {edgeCapacity && (
              <div className="hidden lg:flex items-center space-x-2 text-blue-400 bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-500/20">
                <SafeIcon icon={FiCpu} />
                <span className="text-xs font-medium font-mono">Edge Capacity: {edgeCapacity}</span>
              </div>
            )}

            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 bg-onyx-950/50 hover:bg-onyx-accent/20 border border-transparent hover:border-onyx-accent/30 rounded-lg transition-all shadow-sm"
            >
              <SafeIcon icon={FiLogOut} className="text-slate-300" />
              <span className="text-sm text-slate-300 font-medium">Logout</span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
