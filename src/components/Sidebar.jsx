import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { Link, useLocation } from 'react-router-dom';

const { 
  FiHome, FiTerminal, FiLogOut, FiShield, FiActivity, 
  FiBarChart3, FiUsers, FiSettings, FiZap, FiGlobe, FiUserCheck, FiUploadCloud, FiUser, FiChevronRight, FiChevronLeft
} = FiIcons;

const Sidebar = () => {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Operations Center',
      icon: FiHome,
      description: 'System Overview',
      path: '/dashboard'
    },
    {
      id: 'command-hub',
      label: 'Command Hub',
      icon: FiTerminal,
      description: 'Onyx AI Interface',
      highlight: true,
      path: '/command-hub'
    },
    {
      id: 'api-center',
      label: 'API Center',
      icon: FiGlobe,
      description: 'Integration Management',
      new: true,
      path: '/api-center'
    },
    {
      id: 'ingest',
      label: 'Ingest',
      icon: FiUploadCloud,
      description: 'Data Import & Processing',
      path: '/ingest'
    },
    {
      id: 'profile',
      label: 'User Profile',
      icon: FiUser,
      description: 'Manage your profile',
      path: '/profile'
    },
    ...(role === 'admin' ? [{
      id: 'admin',
      label: 'Admin Dashboard',
      icon: FiUserCheck,
      description: 'User Management',
      path: '/admin'
    }] : [])
  ];

  const systemStats = [
    { label: 'System Status', value: 'ONLINE', color: 'text-green-400' },
    { label: 'Active Processes', value: '7', color: 'text-blue-400' },
    { label: 'AI Response', value: '0.3s', color: 'text-purple-400' }
  ];

  const dockVariants = {
    collapsed: { width: '80px', transition: { duration: 0.3 } },
    expanded: { width: '320px', transition: { duration: 0.3 } },
    powerOn: {
      opacity: [0, 0.5, 1],
      scale: [0.95, 1],
      boxShadow: ["0 0 0 rgba(34,211,238,0)", "0 0 20px rgba(34,211,238,0.5)", "0 0 0 rgba(34,211,238,0)"],
      transition: { duration: 0.8, ease: "easeInOut" }
    }
  };

  const textVariants = {
    collapsed: { opacity: 0, display: 'none', transition: { duration: 0.1 } },
    expanded: { opacity: 1, display: 'block', transition: { duration: 0.2, delay: 0.1 } }
  };

  return (
    <motion.div
      initial="powerOn"
      animate={isHovered ? 'expanded' : 'collapsed'}
      variants={dockVariants}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="glass-effect border-r border-onyx-accent/20 flex flex-col z-40 bg-onyx-950/80 backdrop-blur-md relative overflow-hidden"
    >
      {/* Decorative Scanline */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px]" />

      {/* Header */}
      <div className="p-4 border-b border-onyx-accent/20 flex flex-col items-center">
        <motion.div
          className="flex items-center w-full justify-center mb-2"
          animate={{ justifyContent: isHovered ? 'flex-start' : 'center' }}
        >
          <div className="w-10 h-10 min-w-[40px] bg-gradient-to-r from-onyx-accent to-onyx-ai rounded-lg flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,0.5)]">
            <SafeIcon icon={FiShield} className="text-white text-lg" />
          </div>
          <motion.div variants={textVariants} className="ml-3 whitespace-nowrap">
            <h1 className="text-xl font-bold text-white tracking-wider">AXiM CORE</h1>
            <p className="text-[10px] text-onyx-accent uppercase tracking-widest">System v1.2</p>
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {isHovered && user && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full flex items-center space-x-2 text-slate-300 bg-onyx-950/50 rounded-lg p-2 mt-2 border border-onyx-accent/10"
            >
              <SafeIcon icon={FiUsers} className="text-onyx-accent" />
              <span className="text-xs font-medium truncate">{user.email}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex-1 p-3 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <Link to={item.path} key={item.id}>
              <motion.div
                whileHover={{ backgroundColor: 'rgba(34,211,238,0.1)' }}
                className={`w-full flex items-center p-2 rounded-lg transition-colors duration-200 relative group ${
                  location.pathname === item.path
                    ? 'bg-onyx-accent/20 border border-onyx-accent/30 text-onyx-accent'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {/* Active Indicator Line */}
                {location.pathname === item.path && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-onyx-accent rounded-r-md shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                  />
                )}

                <div className="w-10 h-10 min-w-[40px] flex items-center justify-center relative">
                  <SafeIcon icon={item.icon} className={`text-xl ${location.pathname === item.path ? 'text-onyx-accent drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : ''}`} />
                  {item.highlight && !isHovered && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-onyx-ai rounded-full animate-pulse shadow-[0_0_5px_rgba(168,85,247,0.8)]" />
                  )}
                </div>

                <motion.div variants={textVariants} className="ml-3 flex-1 whitespace-nowrap overflow-hidden">
                  <div className="font-medium text-sm tracking-wide flex items-center">
                    {item.label}
                    {item.highlight && (
                       <span className="ml-2 w-2 h-2 bg-onyx-ai rounded-full animate-pulse shadow-[0_0_5px_rgba(168,85,247,0.8)]" />
                    )}
                  </div>
                  <div className="text-[10px] opacity-70 truncate">{item.description}</div>
                </motion.div>
              </motion.div>
            </Link>
          ))}
        </nav>

        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-8 px-2"
            >
              <h3 className="text-[10px] font-bold text-onyx-accent/50 uppercase tracking-widest mb-4 flex items-center">
                <SafeIcon icon={FiActivity} className="mr-2" /> Telemetry Stream
              </h3>
              <div className="space-y-3 bg-onyx-950/50 p-3 rounded-lg border border-onyx-accent/10">
                {systemStats.map((stat, index) => (
                  <div key={index} className="flex justify-between items-center border-b border-onyx-accent/5 pb-2 last:border-0 last:pb-0">
                    <span className="text-xs text-slate-400">{stat.label}</span>
                    <span className={`text-xs font-mono font-bold ${
                      stat.color === 'text-green-400' ? 'text-[#00ffcc] drop-shadow-[0_0_5px_rgba(0,255,204,0.5)]' :
                      stat.color === 'text-blue-400' ? 'text-onyx-accent drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' :
                      stat.color === 'text-purple-400' ? 'text-onyx-ai drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]' :
                      stat.color
                    }`}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-onyx-accent/20">
        <motion.button
          whileHover={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
          whileTap={{ scale: 0.95 }}
          onClick={logout}
          className="w-full flex items-center p-2 rounded-lg transition-colors text-slate-400 hover:text-red-400 group"
        >
          <div className="w-10 h-10 min-w-[40px] flex items-center justify-center">
            <SafeIcon icon={FiLogOut} className="text-xl group-hover:drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>
          <motion.span variants={textVariants} className="ml-3 text-sm font-medium tracking-wide">
            Terminate Session
          </motion.span>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default Sidebar;