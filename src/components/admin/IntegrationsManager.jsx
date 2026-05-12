import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSupabase } from '../../contexts/SupabaseContext';
import { FiLink, FiActivity, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import toast from 'react-hot-toast';

const IntegrationsManager = () => {
  const { supabase } = useSupabase();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active integrations config
  const integrations = [
    { id: 'make', name: 'Make.com', status: 'active' },
    { id: 'powur', name: 'Powur', status: 'active' },
    { id: 'albato', name: 'Albato', status: 'active' },
    { id: 'chatbase', name: 'Chatbase', status: 'active' }
  ];

  const fetchLogs = async () => {
    try {
      setLoading(true);
      if (!supabase) return;

      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      toast.error('Failed to fetch webhook logs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center">
            <SafeIcon icon={FiLink} className="mr-2 text-indigo-400" />
            Integrations & Webhooks
          </h2>
          <p className="text-sm text-slate-400">Manage connections and view payload logs.</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center text-sm bg-onyx-800 hover:bg-onyx-700 px-3 py-1.5 rounded transition-colors text-white"
        >
          <SafeIcon icon={FiRefreshCw} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Logs
        </button>
      </div>

      {/* Active Integrations Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {integrations.map(integration => (
          <div key={integration.id} className="bg-onyx-900 border border-onyx-accent/20 rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-200">{integration.name}</h3>
              <span className="text-xs text-green-400 flex items-center mt-1">
                <span className="h-2 w-2 rounded-full bg-green-400 mr-1"></span>
                {integration.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Webhook Logs */}
      <div className="bg-onyx-900 border border-onyx-accent/20 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-onyx-accent/20 bg-onyx-950/50 flex items-center">
          <SafeIcon icon={FiActivity} className="mr-2 text-slate-400" />
          <h3 className="font-semibold text-slate-200">Recent Webhook Logs</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No recent logs found.</div>
        ) : (
          <div className="divide-y divide-onyx-accent/20">
            {logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-onyx-800/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium mr-3 ${log.status_code >= 400 ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>
                      {log.status_code || '200'}
                    </span>
                    <span className="font-mono text-sm text-slate-300">{log.endpoint}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                {log.status_code >= 400 && (
                  <div className="mt-2 text-xs font-mono text-red-300 bg-red-950/30 p-2 rounded border border-red-900/50 flex items-start">
                    <SafeIcon icon={FiAlertCircle} className="mr-1.5 mt-0.5 flex-shrink-0" />
                    <span className="break-all">{log.error_message || 'Payload validation failed or endpoint returned an error.'}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationsManager;
