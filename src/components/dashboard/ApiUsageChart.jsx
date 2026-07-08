import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard } from '../../contexts/DashboardContext';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import config from '../../config';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { supabase } from '../../services/supabaseClient';
import logger from '../../services/logging';

const { FiTrendingUp, FiAlertTriangle, FiActivity } = FiIcons;

const ChartSkeleton = () => {
  return (
    <div className="h-64 flex flex-col items-center justify-center space-y-4">
       <div className="animate-pulse flex space-x-4 items-end h-full w-full px-8 pb-4">
         {[40, 70, 45, 90, 65, 80, 50].map((height, i) => (
           <div key={i} className="w-full bg-onyx-950/50 rounded-t" style={{ height: `${height}%` }}></div>
         ))}
       </div>
    </div>
  );
};

const PieSkeleton = () => {
  return (
    <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse w-48 h-48 bg-onyx-950 rounded-full border-8 border-slate-800"></div>
    </div>
  );
};

const ApiUsageChart = () => {
  const { refreshKey } = useDashboard();
  const { isOnline, offlineTelemetryCache, clearOfflineTelemetry } = useConnectivity();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [synchronizedPackets, setSynchronizedPackets] = useState(0);

  const fetchApiUsageData = async () => {
    setLoading(true);
    setError(null);

    if (config.isMockLlmEnabled) {
      logger.debug('Mock mode: providing mock API usage data.');
      const mockData = [
        { date: '2023-10-01', successCount: 120, errorCount: 10, deflectedStorms: 2, enrichmentFaults: 0, kvWriteFaults: 0 },
        { date: '2023-10-02', successCount: 150, errorCount: 5, deflectedStorms: 0, enrichmentFaults: 1, kvWriteFaults: 0 },
        { date: '2023-10-03', successCount: 200, errorCount: 15, deflectedStorms: 5, enrichmentFaults: 0, kvWriteFaults: 2 },
        { date: '2023-10-04', successCount: 180, errorCount: 8, deflectedStorms: 1, enrichmentFaults: 0, kvWriteFaults: 0 },
        { date: '2023-10-05', successCount: 250, errorCount: 12, deflectedStorms: 0, enrichmentFaults: 2, kvWriteFaults: 1 },
        { date: '2023-10-06', successCount: 230, errorCount: 20, deflectedStorms: 10, enrichmentFaults: 0, kvWriteFaults: 0 },
        { date: '2023-10-07', successCount: 300, errorCount: 18, deflectedStorms: 4, enrichmentFaults: 3, kvWriteFaults: 0 },
      ];
      setData(mockData);
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user");

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: logs, error: supabaseError } = await supabase
        .from('api_usage_logs')
        .select('created_at, status_code, details, headers, endpoint')
        .eq('partner_id', user.id)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (supabaseError) throw supabaseError;

      const aggregated = {};
      logs.forEach(log => {
        const date = new Date(log.created_at).toLocaleDateString();
        if (!aggregated[date]) {
          aggregated[date] = { date, successCount: 0, errorCount: 0, deflectedStorms: 0, enrichmentFaults: 0, kvWriteFaults: 0 };
        }
        if (log.status_code >= 200 && log.status_code < 300) {
          aggregated[date].successCount++;
        } else if (log.status_code === 429 && log.details?.event === 'deflected_ingress_storm') {
          aggregated[date].deflectedStorms += log.details.count || 1;
        } else if (log.status_code === 429 && log.headers && log.headers['x-axim-edge-throttled']) {
          aggregated[date].deflectedStorms += parseInt(log.headers['x-axim-edge-throttled'], 10) || 1;
        } else {
          let hasFault = false;
          if (log.details?.telemetry && Array.isArray(log.details.telemetry)) {
              log.details.telemetry.forEach(t => {
                  if (t.type === 'enrichment_fault') {
                      aggregated[date].enrichmentFaults++;
                      hasFault = true;
                  } else if (t.type === 'kv_write_fault') {
                      aggregated[date].kvWriteFaults++;
                      hasFault = true;
                  }
              });
          }
          if (!hasFault) {
             aggregated[date].errorCount++;
          }
        }
      });

      const formattedData = Object.values(aggregated).sort((a, b) => new Date(a.date) - new Date(b.date));

      if (formattedData.length === 0) {
         formattedData.push({ date: new Date().toLocaleDateString(), successCount: 0, errorCount: 0, deflectedStorms: 0, enrichmentFaults: 0, kvWriteFaults: 0 });
      }

      setData(formattedData);
    } catch (error) {
      logger.error('Error fetching API usage data:', error);
      setError('Failed to load API usage data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOnline && offlineTelemetryCache.length > 0) {
      // Calculate compression efficiency metrics as requested by architecture
      const uncompressedSize = JSON.stringify(offlineTelemetryCache).length;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRestoring(true);
      setSynchronizedPackets(offlineTelemetryCache.length);

      setData(currentData => {
        // Create a deep copy to prevent unwanted layout shifts and component unmounts
        const newData = currentData.map(item => ({...item}));

        offlineTelemetryCache.forEach(log => {
          const date = new Date(log.created_at || Date.now()).toLocaleDateString();
          let dateEntry = newData.find(item => item.date === date);

          if (!dateEntry) {
            dateEntry = { date, successCount: 0, errorCount: 0, deflectedStorms: 0, enrichmentFaults: 0, kvWriteFaults: 0 };
            newData.push(dateEntry);
          }

          if (log.status_code >= 200 && log.status_code < 300) {
            dateEntry.successCount++;
          } else if (log.status_code === 429 && log.details?.event === 'deflected_ingress_storm') {
            dateEntry.deflectedStorms += log.details.count || 1;
          } else if (log.status_code === 429 && log.headers && log.headers['x-axim-edge-throttled']) {
            dateEntry.deflectedStorms += parseInt(log.headers['x-axim-edge-throttled'], 10) || 1;
          } else {
             let hasFault = false;
             if (log.details?.telemetry && Array.isArray(log.details.telemetry)) {
                  log.details.telemetry.forEach(t => {
                      if (t.type === 'enrichment_fault') {
                          dateEntry.enrichmentFaults++;
                          hasFault = true;
                      } else if (t.type === 'kv_write_fault') {
                          dateEntry.kvWriteFaults++;
                          hasFault = true;
                      }
                  });
              }
              if (!hasFault) {
                 dateEntry.errorCount++;
              }
          }
        });

        newData.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate compression ratio metric for the synchronized telemetry block
        const compressedSize = JSON.stringify(newData).length;
        const compressionRatio = compressedSize > 0 ? (uncompressedSize / compressedSize).toFixed(2) : '1.00';
        logger.debug(`Synchronized backfill cluster. Compression Ratio: ${compressionRatio}`);

        return newData;
      });

      clearOfflineTelemetry();

      const timer = setTimeout(() => {
        setIsRestoring(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, offlineTelemetryCache, clearOfflineTelemetry]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApiUsageData();

    const channel = supabase.channel('api_usage_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'api_usage_logs' },
        (payload) => {
          const newLog = payload.new;
          const date = new Date(newLog.created_at).toLocaleDateString();

          setData(currentData => {
            const newData = [...currentData];
            let dateEntry = newData.find(item => item.date === date);

            if (!dateEntry) {
              dateEntry = { date, successCount: 0, errorCount: 0, deflectedStorms: 0, enrichmentFaults: 0, kvWriteFaults: 0 };
              newData.push(dateEntry);
              newData.sort((a, b) => new Date(a.date) - new Date(b.date));
            }

            if (newLog.status_code >= 200 && newLog.status_code < 300) {
              dateEntry.successCount++;
            } else if (newLog.status_code === 429 && newLog.details?.event === 'deflected_ingress_storm') {
              dateEntry.deflectedStorms += newLog.details.count || 1;
            } else if (newLog.status_code === 429 && newLog.headers && newLog.headers['x-axim-edge-throttled']) {
              dateEntry.deflectedStorms += parseInt(newLog.headers['x-axim-edge-throttled'], 10) || 1;
            } else {
               let hasFault = false;
               if (newLog.details?.telemetry && Array.isArray(newLog.details.telemetry)) {
                    newLog.details.telemetry.forEach(t => {
                        if (t.type === 'enrichment_fault') {
                            dateEntry.enrichmentFaults++;
                            hasFault = true;
                        } else if (t.type === 'kv_write_fault') {
                            dateEntry.kvWriteFaults++;
                            hasFault = true;
                        }
                    });
                }
                if (!hasFault) {
                   dateEntry.errorCount++;
                }
            }

            return newData;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshKey]);

  if (error) {
    return (
      <div className="glass-effect rounded-xl p-6 flex items-center justify-center text-red-400">
        <SafeIcon icon={FiAlertTriangle} className="mr-2" />
        {error}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-effect rounded-xl p-6 mt-6 relative overflow-hidden"
    >
      <AnimatePresence>
        {isRestoring && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 transition-all duration-1000 ease-in-out pointer-events-none"
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between space-x-3 mb-6 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center">
            <SafeIcon icon={FiTrendingUp} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">API Usage Over Time</h3>
            <p className="text-sm text-slate-400">Daily API call volume</p>
          </div>
        </div>

        <motion.div
          animate={isRestoring ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 1.5, repeat: isRestoring ? Infinity : 0 }}
          className="glass-effect bg-slate-800/80 border border-slate-700/50 px-4 py-2 rounded-full flex items-center backdrop-blur-md"
        >
          <SafeIcon icon={FiActivity} className={`mr-2 ${isRestoring ? 'text-amber-400' : 'text-emerald-400'}`} />
          <span className="text-xs font-mono font-medium text-slate-200 tracking-wider">
            {isRestoring ? 'RESTORING DATA...' : 'Synchronized Edge Packets'}
            <span className="ml-2 px-2 py-0.5 bg-slate-900 rounded-md text-emerald-400">
              {synchronizedPackets}
            </span>
          </span>
        </motion.div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center relative z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300} className="relative z-10">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <YAxis stroke="#9CA3AF" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#F9FAFB' }} />
            <Bar dataKey="successCount" name="Requests Made" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
            <Bar dataKey="errorCount" name="Errors" fill="#EF4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="enrichmentFaults" name="Enrichment Faults" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="kvWriteFaults" name="KV Write Faults" fill="#EC4899" radius={[4, 4, 0, 0]} />
            <Bar dataKey="deflectedStorms" name="Deflected Storms" fill="#F59E0B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </motion.div>
  );
};

export default ApiUsageChart;
