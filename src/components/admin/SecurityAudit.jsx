import React, { useState, useEffect } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiShield, FiAlertTriangle, FiActivity, FiServer } from 'react-icons/fi';
import logger from '../../services/logging';

const SecurityAudit = () => {
  const { supabase } = useSupabase();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [selectedTraceId, setSelectedTraceId] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        if (!supabase) throw new Error("Supabase client not initialized");
        const { data, error } = await supabase
          .from('hitl_audit_logs')
          .select('*, admin:admin_id(email)')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (error) throw error;
        setLogs(data || []);
      } catch (err) {
        logger.error("Failed to fetch HITL audit logs:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();


    const fetchTelemetry = async () => {
      setLoadingTelemetry(true);
      try {
        // Fetch security anomalies
        const { data: anomalies, error: anomalyError } = await supabase
          .from('telemetry_logs')
          .select('*')
          .eq('event', 'security_anomaly')
          .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('timestamp', { ascending: false });

        if (anomalyError) throw anomalyError;
        setTelemetryLogs(anomalies || []);
      } catch (err) {
        logger.error("Failed to fetch telemetry logs:", err);
      } finally {
        setLoadingTelemetry(false);
      }
    };
    fetchTelemetry();
  }, [supabase]);

  if (error) {
    return (
      <div className="p-6 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
        <div className="flex items-center mb-2">
           <SafeIcon icon={FiAlertTriangle} className="mr-2" />
           <h3 className="font-bold">Error loading audit logs</h3>
        </div>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="glass-effect rounded-xl p-6">
      <div className="flex items-center mb-6">
        <SafeIcon icon={FiShield} className="mr-3 text-2xl text-indigo-400" />
        <div>
           <h2 className="text-xl font-bold text-white">Security Audit</h2>
           <p className="text-sm text-slate-400">Human-in-the-Loop action logs</p>
        </div>
      </div>

      {loading ? (
         <div className="space-y-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-onyx-950/50 h-16 rounded-lg w-full"></div>
            ))}
         </div>
      ) : logs.length === 0 ? (
         <div className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
            No Human-in-the-Loop actions recorded yet.
         </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
             <thead>
                <tr className="border-b border-onyx-accent/20 text-xs uppercase tracking-wider text-slate-400">
                   <th className="p-3">Timestamp</th>
                   <th className="p-3">Admin</th>
                   <th className="p-3">Action</th>
                   <th className="p-3">Tool Called</th>
                </tr>
             </thead>
             <tbody>
                {logs.map((log) => (
                    <tr key={log.id} className="border-b border-onyx-accent/10 hover:bg-onyx-950/50 transition-colors text-sm">
                       <td className="p-3 text-slate-300">
                           {new Date(log.timestamp).toLocaleString()}
                       </td>
                       <td className="p-3 text-slate-300 truncate max-w-xs">
                           {log.admin?.email || log.admin_id}
                       </td>
                       <td className="p-3">
                           <span className={`px-2 py-1 rounded text-xs ${
                               log.action === 'approve'
                               ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                               : 'bg-red-500/20 text-red-400 border border-red-500/30'
                           }`}>
                              {log.action.toUpperCase()}
                           </span>
                       </td>
                       <td className="p-3 text-indigo-300 font-mono text-xs">
                           {log.tool_called || 'N/A'}
                       </td>
                    </tr>
                ))}
             </tbody>
          </table>
        </div>
      )}

      <div className="glass-effect rounded-xl p-6 mt-8">

        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <SafeIcon icon={FiActivity} className="mr-3 text-2xl text-yellow-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Security Anomalies</h2>
              <p className="text-sm text-slate-400">Recent security_anomaly events (24h)</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="bg-red-900/30 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg font-mono text-sm">
              Threats Blocked (24h): {telemetryLogs.length}
            </div>
            <button
              onClick={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('onyx-sentinel', {
                    body: { logs: telemetryLogs }
                  });
                  if (error) throw error;
                  alert("Onyx Sentinel summary generated successfully!");
                } catch (err) {
                  alert("Error calling Onyx Sentinel: " + err.message);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center transition-colors text-sm font-semibold"
            >
              <SafeIcon icon={FiServer} className="mr-2" />
              Ask Onyx Sentinel
            </button>
          </div>
        </div>


        {loadingTelemetry ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-onyx-950/50 h-16 rounded-lg w-full"></div>
            ))}
          </div>
        ) : telemetryLogs.length === 0 ? (
          <div className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
            No security anomalies recorded in the last 24 hours.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-onyx-accent/20 text-xs uppercase tracking-wider text-slate-400">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Endpoint</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {telemetryLogs.map((log) => (
                  <tr key={log.id} className="border-b border-onyx-accent/10 hover:bg-onyx-950/50 transition-colors text-sm">
                    <td className="p-3 text-slate-300">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 text-slate-300 font-mono text-xs text-red-400">
                      {log.ip_address || 'Unknown'}
                    </td>
                    <td className="p-3 text-slate-300">
                      {log.endpoint || 'Unknown'}
                    </td>
                    <td className="p-3 text-slate-300 font-semibold text-yellow-300">
                      {log.details?.reason || 'Unknown'}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedTraceId(selectedTraceId === log.id ? null : log.id)}
                        className="text-indigo-400 hover:text-indigo-300 font-mono text-xs transition-colors"
                      >
                        {log.id || 'N/A'}
                      </button>
                      {selectedTraceId === log.id && (
                        <div className="mt-2 p-3 bg-onyx-950 rounded border border-onyx-accent/20 text-xs text-slate-400">
                          <p><strong>Trace Details:</strong></p>
                          <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityAudit;
