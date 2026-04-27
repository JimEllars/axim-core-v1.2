import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiServer, FiActivity, FiAlertTriangle, FiCheckCircle, FiDollarSign } from 'react-icons/fi';
import { Switch } from '@headlessui/react';
import logger from '../../services/logging';
import toast from 'react-hot-toast';

const FleetStatusMap = () => {
  const { supabase } = useSupabase();
  const [fleetStatus, setFleetStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFinancials, setShowFinancials] = useState(false);
  const [expandedApp, setExpandedApp] = useState(null); // Added for click-to-expand

  useEffect(() => {
    const fetchFleetData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!supabase) throw new Error("Supabase client not initialized.");

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Fetch transactions for revenue layer
        const { data: transactions, error: txError } = await supabase
          .from('micro_app_transactions')
          .select('product_id, amount_total')
          .gte('created_at', twentyFourHoursAgo);

        if (txError) logger.warn('Failed to fetch transactions', txError);

        const revenueByApp = {};
        (transactions || []).forEach(tx => {
            const appName = tx.product_id;
            revenueByApp[appName] = (revenueByApp[appName] || 0) + (tx.amount_total / 100);
        });

        // 2. Fetch satellite telemetry for health calculation
        const { data: telemetryLogs, error: telemetryError } = await supabase
          .from('telemetry_logs')
          .select('app_type, event, details, timestamp')
          .gte('timestamp', twentyFourHoursAgo);

        if (telemetryError) throw telemetryError;

        // Process telemetry to calculate app health
        const appsData = {};

        (telemetryLogs || []).forEach(log => {
           const appId = log.app_type;
           if (!appId) return;

           if (!appsData[appId]) {
             appsData[appId] = {
               id: appId,
               name: appId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
               totalEvents: 0,
               errorEvents: 0,
               totalExecutionMs: 0,
               executionEvents: 0,
               revenue: revenueByApp[appId] || 0,
               telemetry: [], // recent events
               errors: [] // Store raw errors
             };
           }

           const app = appsData[appId];
           app.totalEvents++;

           if (log.event === 'error' || log.event === 'integration_failure') {
             app.errorEvents++;
             app.errors.push({
                time: log.timestamp,
                message: log.details && log.details.error || 'Unknown error',
                stack: log.details && log.details.error_stack
             });
           }

           if (log.details && log.details.execution_ms) {
             app.totalExecutionMs += log.details.execution_ms;
             app.executionEvents++;
           }

           // Keep last 3 events for tooltip
           if (app.telemetry.length < 3) {
              app.telemetry.push({
                 id: log.timestamp,
                 type: log.event,
                 message: `${log.event} ${log.details && log.details.execution_ms ? `(${log.details.execution_ms}ms)` : ''}`,
                 status: (log.event === 'error' || log.event === 'integration_failure') ? 'error' : 'success'
              });
           }
        });

        // Calculate final status and colors
        const fleetArray = Object.values(appsData).map(app => {
           const errorRate = app.totalEvents > 0 ? (app.errorEvents / app.totalEvents) : 0;
           app.errorRate = errorRate;
           app.avgExecutionMs = app.executionEvents > 0 ? Math.round(app.totalExecutionMs / app.executionEvents) : 0;

           let status = 'operational';
           let statusColor = 'bg-green-500/20 border-green-500 text-green-400';

           if (errorRate > 0.05) { // > 5% error rate -> Critical
              status = 'critical';
              statusColor = 'bg-red-500/20 border-red-500 text-red-400';
           } else if (errorRate >= 0.01 || app.avgExecutionMs > 3000) { // 1-5% or high latency -> Degraded
              status = 'degraded';
              statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
           }

           app.status = status;
           app.statusColor = statusColor;

           // Sort errors newest first
           app.errors.sort((a, b) => new Date(b.time) - new Date(a.time));

           return app;
        });

        setFleetStatus(fleetArray);

      } catch (err) {
        logger.error("Failed to fetch fleet data", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFleetData();

    if (supabase) {
        // Subscribe to real-time telemetry_logs inserts
        const telemetrySub = supabase
          .channel('fleet-telemetry-logs')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry_logs' }, payload => {
              const newLog = payload.new;

              setFleetStatus(prev => {
                  const newFleet = [...prev];
                  const appId = newLog.app_type;
                  if (!appId) return prev;

                  let deviceIndex = newFleet.findIndex(d => d.id === appId);

                  // If new app, just re-fetch for simplicity to recalculate baseline
                  if (deviceIndex === -1) {
                     fetchFleetData();
                     return prev;
                  }

                  const app = { ...newFleet[deviceIndex] };

                  app.totalEvents++;
                  if (newLog.event === 'error' || newLog.event === 'integration_failure') {
                     app.errorEvents++;
                     app.errors = [{
                        time: newLog.timestamp,
                        message: newLog.details && newLog.details.error || 'Unknown error',
                        stack: newLog.details && newLog.details.error_stack
                     }, ...app.errors];
                  }

                  if (newLog.details && newLog.details.execution_ms) {
                     app.totalExecutionMs += newLog.details.execution_ms;
                     app.executionEvents++;
                  }

                  const errorRate = app.totalEvents > 0 ? (app.errorEvents / app.totalEvents) : 0;
                  app.errorRate = errorRate;
                  app.avgExecutionMs = app.executionEvents > 0 ? Math.round(app.totalExecutionMs / app.executionEvents) : 0;

                  let status = 'operational';
                  let statusColor = 'bg-green-500/20 border-green-500 text-green-400';

                  if (errorRate > 0.05) {
                     status = 'critical';
                     statusColor = 'bg-red-500/20 border-red-500 text-red-400';
                  } else if (errorRate >= 0.01 || app.avgExecutionMs > 3000) {
                     status = 'degraded';
                     statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
                  }

                  app.status = status;
                  app.statusColor = statusColor;
                  app.telemetry = [
                     {
                        id: newLog.timestamp,
                        type: newLog.event,
                        message: `${newLog.event}`,
                        status: (newLog.event === 'error' || newLog.event === 'integration_failure') ? 'error' : 'success'
                     },
                     ...app.telemetry.slice(0, 2)
                  ];

                  newFleet[deviceIndex] = app;
                  return newFleet;
              });
          })
          .subscribe();

        return () => {
            supabase.removeChannel(telemetrySub);
        };
    }
  }, [supabase]);

  if (error) {
     return (
       <div className="glass-effect rounded-xl p-6 flex flex-col justify-center text-red-400">
         <div className="flex items-center mb-2">
            <SafeIcon icon={FiAlertTriangle} className="mr-2" />
            <h3 className="font-bold text-white">Fleet Status Error</h3>
         </div>
         <p className="text-sm">{error}</p>
       </div>
     );
  }

  return (
    <div className="glass-effect rounded-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center">
            <SafeIcon icon={FiServer} className="mr-2 text-blue-400" />
            Ecosystem Fleet Heatmap
          </h3>
          <p className="text-sm text-slate-400">Real-time status of connected micro-apps and services</p>
        </div>
        <div className="flex items-center space-x-3">
           <span className="text-sm text-slate-300 font-medium">Financial Metrics</span>
           <Switch
             checked={showFinancials}
             onChange={setShowFinancials}
             className={`${showFinancials ? 'bg-green-500' : 'bg-slate-600'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
           >
             <span className={`${showFinancials ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
           </Switch>
        </div>
      </div>

      {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="animate-pulse bg-onyx-950/50 h-24 rounded-lg"></div>
            ))}
          </div>
      ) : fleetStatus.length === 0 ? (
          <div className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
            No telemetry data available for satellite apps in the last 24 hours.
          </div>
      ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {fleetStatus.map(device => (
               <motion.div
                  key={device.id}
                  className="relative group cursor-pointer"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setExpandedApp(expandedApp === device.id ? null : device.id)}
               >
                    {/* Revenue Glow Logic */}
                  <motion.div
                    className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center h-24 transition-all duration-500 relative ${device.statusColor}`}
                    style={showFinancials && device.revenue > 0 ? { boxShadow: `0 0 ${Math.min(device.revenue / 10 + 5, 20)}px rgba(34, 197, 94, ${Math.min(device.revenue / 100 + 0.2, 0.8)})` } : {}}
                    animate={{ backgroundColor: device.statusColor.split(' ')[0].replace('bg-', '').replace('/20', '') === 'green-500' ? 'rgba(34, 197, 94, 0.2)' : device.statusColor.split(' ')[0].replace('bg-', '').replace('/20', '') === 'yellow-500' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}
                  >
                      <SafeIcon icon={FiServer} className="mb-2 text-xl" />
                      <span className="text-xs font-semibold truncate w-full text-center">{device.name}</span>
                      {showFinancials && (
                          <div className="absolute top-2 right-2 text-green-400 opacity-80">
                              <SafeIcon icon={FiDollarSign} className="text-sm" />
                          </div>
                      )}
                  </motion.div>

                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-onyx-950 border border-onyx-accent/30 rounded-lg shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                     <h4 className="text-white text-xs font-bold mb-2 border-b border-onyx-accent/20 pb-1">{device.name} Stats</h4>
                     <ul className="space-y-1 text-xs text-slate-300">
                        <li>Error Rate: {(device.errorRate * 100).toFixed(1)}%</li>
                        <li>Avg Latency: {device.avgExecutionMs}ms</li>
                     </ul>
                  </div>

                  {/* Click to expand errors */}
                  <AnimatePresence>
                     {expandedApp === device.id && (
                        <motion.div
                           initial={{ opacity: 0, height: 0 }}
                           animate={{ opacity: 1, height: 'auto' }}
                           exit={{ opacity: 0, height: 0 }}
                           className="col-span-full mt-2 bg-onyx-950 border border-onyx-accent/30 rounded-lg p-4 overflow-hidden z-10 absolute left-0 right-0 w-[300px] shadow-2xl"
                           style={{ minWidth: 'max-content' }}
                           onClick={(e) => e.stopPropagation()}
                        >
                           <h4 className="text-white font-bold mb-2 flex items-center justify-between">
                             <span>Recent Errors: {device.name}</span>
                             <button onClick={() => setExpandedApp(null)} className="text-slate-400 hover:text-white">✕</button>
                           </h4>
                           {device.errors.length === 0 ? (
                              <p className="text-sm text-green-400">No recent errors.</p>
                           ) : (
                              <div className="max-h-48 overflow-y-auto space-y-3">
                                 {device.errors.slice(0, 5).map((err, i) => (
                                    <div key={i} className="bg-onyx-900/50 p-2 rounded border border-red-500/20">
                                       <div className="text-xs text-slate-400">{new Date(err.time).toLocaleString()}</div>
                                       <div className="text-sm text-red-400 font-mono mt-1">{err.message}</div>
                                       {err.stack && (
                                          <pre className="text-[10px] text-slate-500 mt-1 overflow-x-auto p-1 bg-black/30 rounded">
                                             {err.stack}
                                          </pre>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           )}
                        </motion.div>
                     )}
                  </AnimatePresence>
               </motion.div>
            ))}
          </div>
      )}
    </div>
  );
};

export default FleetStatusMap;
