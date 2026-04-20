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

  useEffect(() => {
    const fetchFleetData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!supabase) throw new Error("Supabase client not initialized.");

        // Fetch devices
        // Fetch transactions for revenue layer
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: transactions, error: txError } = await supabase
          .from('micro_app_transactions')
          .select('product_id, amount_total')
          .gte('created_at', twentyFourHoursAgo);

        if (txError) logger.warn('Failed to fetch transactions', txError);

        // Calculate revenue per app (product_id mapped to device_name for now)
        const revenueByApp = {};
        (transactions || []).forEach(tx => {
            const appName = tx.product_id;
            revenueByApp[appName] = (revenueByApp[appName] || 0) + (tx.amount_total / 100); // Assuming amount_total is in cents
        });

        const { data: devices, error: deviceError } = await supabase
          .from('devices')
          .select('*')
          .order('device_name');

        if (deviceError) throw deviceError;

        // Mock initial event data to represent "telemetry" as described in the requirements
        const mockTelemetry = [
            { id: 1, type: 'api_call', message: 'Latency: 45ms', status: 'success' },
            { id: 2, type: 'user_login', message: 'Active Session', status: 'success' }
        ];

        const mappedStatus = (devices || []).map(device => {
            let statusColor = 'bg-green-500/20 border-green-500 text-green-400';
            if (device.status === 'busy') statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
            if (device.status === 'offline') statusColor = 'bg-red-500/20 border-red-500 text-red-400';

            return {
                id: device.id,
                revenue: revenueByApp[device.device_name] || 0,
                name: device.device_name,
                status: device.status,
                statusColor,
                telemetry: [
                   ...mockTelemetry.map(t => ({...t, id: Math.random()}))
                ]
            };
        });

        setFleetStatus(mappedStatus);
      } catch (err) {
        logger.error('Failed to load fleet status:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchFleetData();

    // Real-time subscription to devices and events
    if (supabase) {
        const deviceSub = supabase
          .channel('fleet-devices')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, payload => {
              if (payload.eventType === 'UPDATE') {
                  setFleetStatus(prev => {
                      const newFleet = [...prev];
                      const deviceIndex = newFleet.findIndex(d => d.id === payload.new.id);
                      if (deviceIndex > -1) {
                          const updatedDevice = payload.new;
                          let statusColor = 'bg-green-500/20 border-green-500 text-green-400';
                          if (updatedDevice.status === 'busy' || updatedDevice.status === 'degraded') statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
                          if (updatedDevice.status === 'offline') statusColor = 'bg-red-500/20 border-red-500 text-red-400';

                          newFleet[deviceIndex] = {
                              ...newFleet[deviceIndex],
                              status: updatedDevice.status,
                              statusColor
                          };
                      }
                      return newFleet;
                  });
              } else if (payload.eventType === 'INSERT') {
                  fetchFleetData(); // Refresh list if a new device is added
              }
          })
          .subscribe();

        const eventSub = supabase
          .channel('fleet-telemetry')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events_ax2024' }, payload => {
              const newEvent = payload.new;
              // Randomly assign to a device for mock demo, or match if user_id/device_id aligns
              setFleetStatus(prev => {
                  if (prev.length === 0) return prev;
                  // Pick a random device to update its status or append telemetry
                  const deviceIndex = Math.floor(Math.random() * prev.length);
                  const newFleet = [...prev];
                  const device = newFleet[deviceIndex];

                  // If it's an error event, change status to degraded/busy
                  let newStatus = device.status;
                  let newColor = device.statusColor;
                  let msgStatus = 'success';

                  if (newEvent.type === 'error' || (newEvent.data && newEvent.data.status === 'error')) {
                     newStatus = 'degraded';
                     newColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
                     msgStatus = 'error';
                  } else {
                     newStatus = 'operational';
                     newColor = 'bg-green-500/20 border-green-500 text-green-400';
                  }

                  newFleet[deviceIndex] = {
                      ...device,
                      status: newStatus,
                      statusColor: newColor,
                      telemetry: [
                          { id: newEvent.id, type: newEvent.type, message: newEvent.type + ' event', status: msgStatus },
                          ...device.telemetry.slice(0, 2) // keep last 3
                      ]
                  };
                  return newFleet;
              });
          })
          .subscribe();

        const auditSub = supabase
          .channel('hitl-audit-logs')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs' }, payload => {
              const newLog = payload.new;
              setFleetStatus(prev => {
                  if (prev.length === 0) return prev;
                  // For Swarm actions, we might not have a specific device mapping,
                  // but we update the overall feed. For this demo, let's append to a random or specific "Swarm" device
                  const deviceIndex = Math.floor(Math.random() * prev.length);
                  const newFleet = [...prev];
                  const device = newFleet[deviceIndex];

                  newFleet[deviceIndex] = {
                      ...device,
                      telemetry: [
                          { id: newLog.id, type: 'swarm_action', message: `Onyx: ${newLog.action} (${newLog.tool_called || 'N/A'})`, status: 'success' },
                          ...device.telemetry.slice(0, 2)
                      ]
                  };
                  return newFleet;
              });
          })
          .subscribe();

        return () => {
            supabase.removeChannel(deviceSub);
            supabase.removeChannel(eventSub);
            supabase.removeChannel(auditSub);
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
            No devices currently registered in the fleet.
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
                     <h4 className="text-white text-xs font-bold mb-2 border-b border-onyx-accent/20 pb-1">{device.name} Telemetry</h4>
                     <ul className="space-y-1">
                        <AnimatePresence>
                        {device.telemetry.map((event, idx) => (
                           <motion.li
                              key={event.id || idx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="text-[10px] flex items-center justify-between"
                           >
                              <span className="text-slate-300 truncate mr-2">{event.message}</span>
                              <SafeIcon
                                icon={event.status === 'success' ? FiCheckCircle : FiActivity}
                                className={event.status === 'success' ? 'text-green-400' : 'text-blue-400'}
                              />
                           </motion.li>
                        ))}
                        </AnimatePresence>
                     </ul>
                  </div>
               </motion.div>
            ))}
          </div>
      )}
    </div>
  );
};

export default FleetStatusMap;
