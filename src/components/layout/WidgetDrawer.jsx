import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiSettings, FiActivity, FiCpu, FiGlobe, FiDatabase, FiLock, FiChevronLeft, FiChevronRight } = FiIcons;

const WidgetDrawer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Determine which widgets to show based on the current route
  const getContextualWidgets = () => {
    switch (location.pathname) {
      case '/api-center':
        return [
          { title: 'API Health', icon: FiGlobe, value: '99.9%', status: 'optimal', color: 'text-green-400' },
          { title: 'Rate Limits', icon: FiActivity, value: '42/1000', status: 'normal', color: 'text-blue-400' },
          { title: 'Failed Requests', icon: FiLock, value: '0', status: 'optimal', color: 'text-onyx-accent' }
        ];
      case '/dashboard':
        return [
          { title: 'Active Users', icon: FiActivity, value: '142', status: 'stable', color: 'text-blue-400' },
          { title: 'Database Load', icon: FiDatabase, value: '23%', status: 'optimal', color: 'text-green-400' },
          { title: 'System CPU', icon: FiCpu, value: '45%', status: 'normal', color: 'text-yellow-400' }
        ];
      case '/command-hub':
        return [
          { title: 'AI Tokens', icon: FiActivity, value: '1.2M', status: 'available', color: 'text-onyx-ai' },
          { title: 'Processing Latency', icon: FiCpu, value: '0.4s', status: 'fast', color: 'text-green-400' }
        ];
      default:
        return [
          { title: 'System Status', icon: FiSettings, value: 'ONLINE', status: 'active', color: 'text-green-400' },
          { title: 'Memory Usage', icon: FiDatabase, value: '64%', status: 'normal', color: 'text-blue-400' }
        ];
    }
  };

  const widgets = getContextualWidgets();

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        className="fixed top-24 right-0 z-40 bg-onyx-950/80 border border-onyx-accent/30 border-r-0 rounded-l-md p-2 text-onyx-accent shadow-[0_0_15px_rgba(34,211,238,0.3)] backdrop-blur-sm"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ x: -2, backgroundColor: 'rgba(34,211,238,0.1)' }}
        whileTap={{ scale: 0.95 }}
      >
        <SafeIcon icon={isOpen ? FiChevronRight : FiChevronLeft} className="text-xl drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
      </motion.button>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 w-72 h-full bg-onyx-950/90 border-l border-onyx-accent/20 z-30 pt-32 pb-24 px-4 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] backdrop-blur-md cyber-grid"
          >
            {/* Context Title */}
            <div className="flex items-center space-x-2 mb-6 border-b border-onyx-accent/20 pb-4">
              <SafeIcon icon={FiActivity} className="text-onyx-ai animate-pulse" />
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Contextual Telemetry</h2>
            </div>

            {/* Widgets List */}
            <div className="space-y-4">
              {widgets.map((widget, idx) => (
                <motion.div
                  key={idx}
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-onyx-950/50 border border-onyx-accent/10 rounded-lg p-4 hover:border-onyx-accent/30 transition-colors group relative overflow-hidden"
                >
                  {/* Subtle scanline effect on hover */}
                  <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(34,211,238,0.05)_50%)] bg-[length:100%_4px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <SafeIcon icon={widget.icon} className={`text-sm ${widget.color}`} />
                      <span className="text-xs font-medium text-slate-400">{widget.title}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 opacity-70">{widget.status}</span>
                  </div>

                  <div className={`text-2xl font-mono font-bold ${widget.color} drop-shadow-[0_0_8px_currentColor]`}>
                    {widget.value}
                  </div>
                </motion.div>
              ))}
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WidgetDrawer;