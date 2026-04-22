import React, { createContext, useContext, useEffect } from 'react';
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

  useEffect(() => {
    if (!user || !supabase) return;

    // We subscribe to public:telemetry_logs, hitl_audit_logs, secure_artifacts
    // depending on the table availability and schema

    // hitl_audit_logs
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
      ).subscribe();

    // telemetry_logs -> events_ax2024 / satellite_pulses
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
      ).subscribe();

    return () => {
      supabase.removeChannel(hitlChannel);
      supabase.removeChannel(telemetryChannel);
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{}}>
      {children}
    </RealtimeContext.Provider>
  );
};
