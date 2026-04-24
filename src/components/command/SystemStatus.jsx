import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiActivity } = FiIcons;

const SystemStatus = ({ stats = {} }) => {
  const [fleetHealth, setFleetHealth] = useState({ status: 'loading', failedApps: [] });

  useEffect(() => {
    const fetchFleetHealth = async () => {
      try {
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('telemetry_logs')
          .select('details')
          .eq('event', 'uptime_failure')
          .gte('created_at', fifteenMinsAgo);

        if (error) {
          console.error("Error fetching fleet health:", error);
          setFleetHealth({ status: 'error', failedApps: [] });
          return;
        }

        if (data && data.length > 0) {
          const failed = [...new Set(data.map(log => log.details?.url).filter(Boolean))];
          setFleetHealth({ status: 'failure', failedApps: failed });
        } else {
          setFleetHealth({ status: 'operational', failedApps: [] });
        }
      } catch (err) {
        console.error("Failed to fetch fleet health:", err);
        setFleetHealth({ status: 'error', failedApps: [] });
      }
    };

    fetchFleetHealth();
    const intervalId = setInterval(fetchFleetHealth, 60000); // Check every minute
    return () => clearInterval(intervalId);
  }, []);

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

        <div className="pt-4 border-t border-onyx-accent/20">
          <p className="text-xs text-slate-400 mb-2">Micro-App Fleet Status</p>
          {fleetHealth.status === 'loading' && <p className="text-sm text-slate-300">Checking status...</p>}
          {fleetHealth.status === 'operational' && (
             <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-400 font-semibold">All Systems Operational</span>
             </div>
          )}
          {fleetHealth.status === 'failure' && (
             <div className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-red-400 font-bold">Outage Detected</span>
                </div>
                {fleetHealth.failedApps.map((app, i) => (
                  <span key={i} className="text-xs text-red-300 ml-5">- {app}</span>
                ))}
             </div>
          )}
          {fleetHealth.status === 'error' && <p className="text-sm text-yellow-500">Status Check Unavailable</p>}
        </div>

      </div>
    </motion.div>
  );
};

export default SystemStatus;
