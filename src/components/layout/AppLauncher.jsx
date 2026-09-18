import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiGrid, FiShield, FiLifeBuoy, FiDatabase, FiCpu, FiGlobe, FiCode, FiActivity, FiBriefcase, FiAperture, FiMic, FiServer } = FiIcons;

const AppLauncher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, aximSessionToken } = useAuth();
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAppLaunch = (targetUrl) => {
    // Generate secure handoff URL
    const handoffUrl = new URL(targetUrl);

    // Pass session access_token securely
    if (aximSessionToken) {
        handoffUrl.searchParams.set('handoff_token', aximSessionToken);
    }
    handoffUrl.searchParams.set('source', 'core');

    window.open(handoffUrl.toString(), '_blank');
    setIsOpen(false);
  };

  const apps = [
    {
      id: 'web3',
      name: 'AXiM Web3 Frontend',
      icon: FiGlobe,
      color: 'text-indigo-400 bg-indigo-400/10',
      description: 'Public Facade & Marketing',
      url: 'https://axim.us.com'
    },
    {
      id: 'greenmachine',
      name: 'Green Machine Core',
      icon: FiActivity,
      color: 'text-emerald-400 bg-emerald-400/10',
      description: 'Energy OS & B2B',
      url: 'https://greenmachine.axim.us.com'
    },
    {
      id: 'support',
      name: 'AXiM Support',
      icon: FiLifeBuoy,
      color: 'text-blue-400 bg-blue-400/10',
      description: 'Ticket & Agent Management',
      url: 'https://support.axim.us.com'
    },
    {
      id: 'coder',
      name: 'AXiM Coding Lab',
      icon: FiCode,
      color: 'text-yellow-400 bg-yellow-400/10',
      description: 'Internal Dev Environment',
      url: 'https://coder.axim.us.com'
    },
    {
      id: 'mesh',
      name: 'AXiM Mesh Network',
      icon: FiDatabase,
      color: 'text-purple-400 bg-purple-400/10',
      description: 'Decentralized Data',
      url: 'https://mesh.axim.us.com'
    },
    {
      id: 'vendos',
      name: 'VendOS Fleet OS',
      icon: FiBriefcase,
      color: 'text-orange-400 bg-orange-400/10',
      description: 'Fleet Management',
      url: 'https://vendos.axim.us.com'
    },
    {
      id: 'onyx',
      name: 'Onyx AI Cockpit',
      icon: FiAperture,
      color: 'text-red-400 bg-red-400/10',
      description: 'Cognitive Engine Control',
      url: 'https://onyx.axim.us.com'
    },
    {
      id: 'passport',
      name: 'AXiM Passport SSO',
      icon: FiShield,
      color: 'text-teal-400 bg-teal-400/10',
      description: 'Identity & Access',
      url: 'https://passport.axim.us.com'
    },
    {
      id: 'voice',
      name: 'Voice Core Hub',
      icon: FiMic,
      color: 'text-pink-400 bg-pink-400/10',
      description: 'Audio Processing',
      url: 'https://voice.axim.us.com'
    },
    {
      id: 'asguard',
      name: 'Asguard SOC Sentinel',
      icon: FiServer,
      color: 'text-cyan-400 bg-cyan-400/10',
      description: 'Security Operations',
      url: 'https://asguard.axim.us.com'
    }
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        whileHover={{ scale: 1.05, backgroundColor: 'rgba(34,211,238,0.1)' }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors border ${isOpen ? 'bg-onyx-accent/20 border-onyx-accent/50 text-onyx-accent' : 'bg-onyx-950/50 border-onyx-accent/20 text-slate-400 hover:text-white'}`}
        aria-label="App Launcher"
      >
        <SafeIcon icon={FiGrid} className="text-xl" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-96 bg-onyx-950 border border-onyx-accent/30 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] overflow-hidden z-50 backdrop-blur-md"
          >
            <div className="p-4 border-b border-onyx-accent/20 bg-onyx-900/50">
              <h3 className="text-white font-bold flex items-center">
                <SafeIcon icon={FiGrid} className="mr-2 text-onyx-accent" />
                Ecosystem Apps
              </h3>
              <p className="text-xs text-slate-400 mt-1">Seamless SSO Navigation</p>
            </div>

            <div className="p-3 grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
              {apps.map(app => (
                <motion.button
                  key={app.id}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)', scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAppLaunch(app.url)}
                  className="group relative flex flex-col items-center justify-center p-4 rounded-lg border border-transparent hover:border-onyx-accent/20 transition-all text-center"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${app.color}`}>
                    <SafeIcon icon={app.icon} className="text-2xl" />
                  </div>
                  <h4 className="text-sm font-semibold text-white">{app.name}</h4>
                  <span className="text-[10px] text-slate-400 mt-1 hidden group-hover:block">{app.description}</span>
                  <div className="absolute top-2 right-2 flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <span className="text-[8px] text-emerald-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">Online</span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppLauncher;
