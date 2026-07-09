import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import { Switch } from '@headlessui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

const { FiServer, FiDollarSign, FiAlertTriangle, FiCheckCircle } = FiIcons;

const FleetStatusMap = () => {
  const [fleetStatus, setFleetStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasOfflineNodes, setHasOfflineNodes] = useState(false);

  const fetchEcosystemNodes = async () => {
      setLoading(true);
      try {
         const { data, error } = await supabase.from('ecosystem_nodes').select('*');
         if (error) throw error;

         if (data) {
             setFleetStatus(data);
             setHasOfflineNodes(data.some(n => n.status === 'offline'));
         }
      } catch (err) {
         console.error("Failed to fetch ecosystem nodes", err);
         setError(err.message);
      } finally {
         setLoading(false);
      }
  };

  useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchEcosystemNodes();

    const handleTelemetryUpdate = (event) => {
        fetchEcosystemNodes();
    };

    const handleExecUpdate = (event) => {
        fetchEcosystemNodes();
    };

    window.addEventListener('axim:telemetry_update', handleTelemetryUpdate);
    window.addEventListener('axim:exec_update', handleExecUpdate);

    const nodesSub = supabase
      .channel('ecosystem_nodes_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ecosystem_nodes' }, () => {
         fetchEcosystemNodes();
      })
      .subscribe();

    return () => {
      window.removeEventListener('axim:telemetry_update', handleTelemetryUpdate);
      window.removeEventListener('axim:exec_update', handleExecUpdate);
      supabase.removeChannel(nodesSub);
    }
  }, []);

  if (error) {
     return (
       <div className="bg-zinc-950/80 rounded-xl p-6 flex flex-col justify-center text-red-400 border border-slate-800">
         <div className="flex items-center mb-2">
            <SafeIcon icon={FiAlertTriangle} className="mr-2" />
            <h3 className="font-bold text-white">Fleet Status Error</h3>
         </div>
         <p className="text-sm">{error}</p>
       </div>
     );
  }

  return (
    <div className="bg-zinc-950/80 border border-slate-800 rounded-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center">
            <SafeIcon icon={FiServer} className="mr-2 text-blue-400" />
            Ecosystem Fleet Heatmap
          </h3>
          <p className="text-sm text-slate-400">Real-time status of connected micro-apps and services</p>
        </div>
      </div>

      {hasOfflineNodes && (
         <div className="mb-6 bg-red-900/30 border border-red-500 rounded p-4 flex justify-between items-center">
            <div className="flex items-center text-red-400">
               <SafeIcon icon={FiAlertTriangle} className="mr-3 text-2xl" />
               <div>
                  <h4 className="font-bold">System Degradation Detected</h4>
                  <p className="text-sm text-red-300">One or more ecosystem nodes are currently offline. Sentinel has logged an audit event.</p>
               </div>
            </div>
            <Link to="/admin" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold shadow-lg">
               Review Approval Queue
            </Link>
         </div>
      )}

      {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="animate-pulse bg-zinc-900/50 h-24 rounded-lg"></div>
            ))}
          </div>
      ) : fleetStatus.length === 0 ? (
          <div className="text-center p-8 text-slate-500 border border-dashed border-slate-800 rounded-lg">
            No telemetry data available for satellite apps in the last 24 hours.
          </div>
      ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {fleetStatus.map(node => {
               const isOffline = node.status === 'offline';
               // eslint-disable-next-line react-hooks/purity
               const lastPingDelta = node.last_ping ? (Date.now() - new Date(node.last_ping).getTime()) / 1000 / 60 : 0;
               const isDegraded = !isOffline && lastPingDelta > 3;

               let statusColor = 'bg-green-500/10 border-green-500/30 text-green-400';
               let displayStatus = node.status;
               if (isOffline) {
                   statusColor = 'bg-red-500/10 border-red-500/30 text-red-400';
               } else if (isDegraded) {
                   statusColor = 'bg-orange-500/10 border-orange-500/30 text-orange-400';
                   displayStatus = 'Degraded/Unresponsive';
               }
               return (
               <motion.div
                  key={node.id}
                  className="relative group cursor-pointer"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
               >
                  <motion.div
                    className={`p-4 rounded-lg border flex flex-col items-center justify-center h-24 transition-all duration-500 relative ${statusColor}`}
                  >
                      <SafeIcon icon={FiServer} className="mb-2 text-xl" />
                      <span className="text-xs font-semibold truncate w-full text-center">{node.app_name}</span>
                  </motion.div>

                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-zinc-950 border border-slate-800 rounded-lg shadow-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                     <h4 className="text-white text-xs font-bold mb-2 border-b border-slate-800 pb-1">{node.app_name}</h4>
                     <ul className="space-y-1 text-xs text-slate-300">
                        <li>Status: {displayStatus}</li>
                        <li>URL: {node.health_endpoint_url}</li>
                        {node.last_ping && <li>Last Ping: {new Date(node.last_ping).toLocaleTimeString()}</li>}
                     </ul>
                  </div>
               </motion.div>
            )})}
          </div>
      )}
    </div>
  );
};

export default FleetStatusMap;
