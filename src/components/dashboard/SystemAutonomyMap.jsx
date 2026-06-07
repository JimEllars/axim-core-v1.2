import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiActivity, FiCpu, FiDatabase, FiServer, FiCheckCircle, FiAlertTriangle, FiXCircle } = FiIcons;

const SystemAutonomyMap = () => {
  const [events, setEvents] = useState([]);
  const [healthStatus, setHealthStatus] = useState('green'); // green, yellow, red

  const fetchEvents = async () => {
    try {
      // Fetch from api_usage_logs for autonomy events like scrapers
      const { data: usageLogs, error: usageError } = await supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (usageError) throw usageError;

      // Fetch from blockchain_transactions for smart contract dispatches
      const { data: bcLogs, error: bcError } = await supabase
        .from('blockchain_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (bcError) throw bcError;

      const formattedUsage = usageLogs.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        source: log.endpoint || 'Unknown Endpoint',
        status: log.status_code < 400 ? 'success' : 'error',
        description: `API Call to ${log.endpoint} (Status: ${log.status_code})`
      }));

      const formattedBc = bcLogs.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        source: 'Smart Contract Dispatcher',
        status: log.status === 'minted' ? 'success' : log.status === 'failed' ? 'error' : 'pending',
        description: `Dispatched to ${log.smart_contract_address} (${log.amount} ${log.currency})`
      }));

      const combined = [...formattedUsage, ...formattedBc]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

      setEvents(combined);

      // Calculate health status
      const recentErrors = combined.filter(e => e.status === 'error').length;
      if (recentErrors > 3) {
        setHealthStatus('red');
      } else if (recentErrors > 0) {
        setHealthStatus('yellow');
      } else {
        setHealthStatus('green');
      }

    } catch (err) {
      console.error('Error fetching autonomy events:', err);
      setHealthStatus('yellow');
    }
  };

  useEffect(() => {
    fetchEvents();

    const usageSub = supabase.channel('api_usage_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'api_usage_logs' }, () => {
        fetchEvents();
      }).subscribe();

    const bcSub = supabase.channel('blockchain_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blockchain_transactions' }, () => {
        fetchEvents();
      }).subscribe();

    return () => {
      supabase.removeChannel(usageSub);
      supabase.removeChannel(bcSub);
    };
  }, []);

  return (
    <div className="glass-effect rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <SafeIcon icon={FiCpu} className="text-indigo-400 text-xl" />
          <h3 className="text-xl font-bold text-white">System Autonomy Map</h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-400">Fleet Health:</span>
          {healthStatus === 'green' && <SafeIcon icon={FiCheckCircle} className="text-green-500 text-xl animate-pulse" />}
          {healthStatus === 'yellow' && <SafeIcon icon={FiAlertTriangle} className="text-yellow-500 text-xl animate-pulse" />}
          {healthStatus === 'red' && <SafeIcon icon={FiXCircle} className="text-red-500 text-xl animate-pulse" />}
        </div>
      </div>

      <div className="space-y-3">
        {events.length === 0 ? (
          <p className="text-slate-400 text-sm">No recent autonomous events.</p>
        ) : (
          events.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded border ${event.status === 'success' ? 'bg-green-900/10 border-green-500/20' : event.status === 'error' ? 'bg-red-900/10 border-red-500/20' : 'bg-yellow-900/10 border-yellow-500/20'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-1">{event.source}</span>
                  <span className="text-sm text-white">{event.description}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default SystemAutonomyMap;
