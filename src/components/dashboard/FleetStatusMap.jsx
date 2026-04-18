import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiServer, FiActivity, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import logger from '../../services/logging';

const FleetStatusMap = () => {
  const { supabase } = useSupabase();
  const [fleetStatus, setFleetStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFleetData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!supabase) throw new Error("Supabase client not initialized.");

        // In a real app we'd fetch devices and recent telemetry logs.
        // For this UI component we will simulate based on the devices table.
        const { data: devices, error: deviceError } = await supabase
          .from('devices')
          .select('*')
          .order('device_name');

        if (deviceError) throw deviceError;

        // Mock event data to represent "telemetry" as described in the requirements
        const mockTelemetry = [
            { id: 1, type: 'api_call', message: 'Latency: 45ms', status: 'success' },
            { id: 2, type: 'user_login', message: 'Active Session', status: 'success' },
            { id: 3, type: 'system_check', message: 'CPU Load Normal', status: 'success' }
        ];

        const mappedStatus = (devices || []).map(device => {
            let statusColor = 'bg-green-500/20 border-green-500 text-green-400';
            if (device.status === 'busy') statusColor = 'bg-yellow-500/20 border-yellow-500 text-yellow-400';
            if (device.status === 'offline') statusColor = 'bg-red-500/20 border-red-500 text-red-400';

            return {
                id: device.id,
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
               <div key={device.id} className="relative group cursor-pointer">
                  <div className={`p-4 rounded-lg border-2 flex flex-col items-center justify-center h-24 transition-all duration-300 ${device.statusColor}`}>
                      <SafeIcon icon={FiServer} className="mb-2 text-xl" />
                      <span className="text-xs font-semibold truncate w-full text-center">{device.name}</span>
                  </div>

                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-onyx-950 border border-onyx-accent/30 rounded-lg shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                     <h4 className="text-white text-xs font-bold mb-2 border-b border-onyx-accent/20 pb-1">{device.name} Telemetry</h4>
                     <ul className="space-y-1">
                        {device.telemetry.map((event, idx) => (
                           <li key={idx} className="text-[10px] flex items-center justify-between">
                              <span className="text-slate-300 truncate mr-2">{event.message}</span>
                              <SafeIcon
                                icon={event.status === 'success' ? FiCheckCircle : FiActivity}
                                className={event.status === 'success' ? 'text-green-400' : 'text-blue-400'}
                              />
                           </li>
                        ))}
                     </ul>
                  </div>
               </div>
            ))}
          </div>
      )}
    </div>
  );
};

export default FleetStatusMap;
