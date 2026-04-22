import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useDashboard } from './DashboardContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const RealtimeContext = createContext();

export const useRealtime = () => useContext(RealtimeContext);

export const RealtimeProvider = ({ children }) => {
  const { user } = useAuth();
  const { refreshDashboard } = useDashboard();
  const hitlChannelRef = useRef(null);
  const telemetryChannelRef = useRef(null);
  const reconnectTimeouts = useRef({ hitl: null, telemetry: null });

  useEffect(() => {
    if (!user || !supabase) return;

    let hitlRetries = 0;
    let telemetryRetries = 0;
    const MAX_RETRIES = 3;

    const setupHitlChannel = () => {
      const hitlChannel = supabase.channel('realtime:hitl_audit_logs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs' },
          (payload) => {
            if (payload.new.status === 'pending') {
              toast.custom((t) => (
                <div
                  className={`${
                    t.visible ? 'animate-enter' : 'animate-leave'
                  } max-w-md w-full bg-onyx-900 border border-yellow-500/50 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
                >
                  <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 pt-0.5">
                        <SafeIcon icon={FiIcons.FiClock} className="h-10 w-10 text-yellow-400" />
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-medium text-white">
                          Onyx AI paused workflow
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Human approval requested for action: {payload.new.action}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex border-l border-onyx-accent/20">
                    <button
                      onClick={() => toast.dismiss(t.id)}
                      className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ), { duration: 5000 });
            }
          }
        ).subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            hitlRetries = 0;
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            if (hitlRetries < MAX_RETRIES) {
              hitlRetries++;
              const backoffTime = Math.pow(2, hitlRetries) * 1000;
              reconnectTimeouts.current.hitl = setTimeout(setupHitlChannel, backoffTime);
            } else {
              toast.error('Disconnected from HITL live updates.', { id: 'offline-hitl' });
            }
          }
        });

      hitlChannelRef.current = hitlChannel;
    };

    const setupTelemetryChannel = () => {
      const telemetryChannel = supabase.channel('realtime:telemetry_logs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events_ax2024' },
          (payload) => {
              const isError = payload.new.type === 'error' || payload.new.data?.error_code >= 500;
              if (isError) {
                  toast.error(`System Event: ${payload.new.type}`, {
                      style: { background: '#7f1d1d', color: '#fff', border: '1px solid #ef4444' }
                  });
              }
          }
        ).subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            telemetryRetries = 0;
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            if (telemetryRetries < MAX_RETRIES) {
              telemetryRetries++;
              const backoffTime = Math.pow(2, telemetryRetries) * 1000;
              reconnectTimeouts.current.telemetry = setTimeout(setupTelemetryChannel, backoffTime);
            } else {
              toast.error('Disconnected from telemetry live updates.', { id: 'offline-telemetry' });
            }
          }
        });

      telemetryChannelRef.current = telemetryChannel;
    };

    setupHitlChannel();
    setupTelemetryChannel();

    return () => {
      if (reconnectTimeouts.current.hitl) clearTimeout(reconnectTimeouts.current.hitl);
      if (reconnectTimeouts.current.telemetry) clearTimeout(reconnectTimeouts.current.telemetry);
      if (hitlChannelRef.current) supabase.removeChannel(hitlChannelRef.current);
      if (telemetryChannelRef.current) supabase.removeChannel(telemetryChannelRef.current);
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{}}>
      {children}
    </RealtimeContext.Provider>
  );
};
