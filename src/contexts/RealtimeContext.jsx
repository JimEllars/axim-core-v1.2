import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useDashboard } from './DashboardContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { listenForWorkflowEvents } from '../services/workflows/engine';

const RealtimeContext = createContext();

export const useRealtime = () => useContext(RealtimeContext);

export const RealtimeProvider = ({ children }) => {
  const { user } = useAuth();
  const { refreshDashboard } = useDashboard();
  const hitlChannelRef = useRef(null);
  const telemetryChannelRef = useRef(null);
  const ticketsChannelRef = useRef(null);
  const workflowListenerRef = useRef(null);
  const reconnectTimeouts = useRef({ hitl: null, telemetry: null });

  useEffect(() => {
    if (!user || !supabase) return;

    let hitlRetries = 0;
    let telemetryRetries = 0;
    const MAX_RETRIES = 3;

    const setupSupportTicketsChannel = () => {
      const ticketsChannel = supabase.channel('realtime:support_tickets')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'support_tickets' },
          (payload) => {
            toast.error('System Degradation Detected: Node isolated. Onyx RCA initiated.', { duration: 5000, id: payload.new.id });
          }
        ).subscribe();
      ticketsChannelRef.current = ticketsChannel;
    };

    const setupHitlChannel = () => {
      const hitlChannel = supabase.channel('realtime:hitl_audit_logs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs' },
          (payload) => {
            if (payload.new.status.toLowerCase() === 'pending') {
              toast.error('Action Required: Tier 4 Agent proposes deployment. Human authorization needed.', { duration: 5000, id: payload.new.id });

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

    setupSupportTicketsChannel();
    setupHitlChannel();
    setupTelemetryChannel();
    workflowListenerRef.current = listenForWorkflowEvents(supabase);

    const handleOnline = () => {
        console.log('RealtimeContext: Network online. Reconnecting WebSockets.');
        if (hitlChannelRef.current) supabase.removeChannel(hitlChannelRef.current);
        if (telemetryChannelRef.current) supabase.removeChannel(telemetryChannelRef.current);
        if (ticketsChannelRef.current) supabase.removeChannel(ticketsChannelRef.current);
        if (workflowListenerRef.current) workflowListenerRef.current();

        setupSupportTicketsChannel();
        setupHitlChannel();
        setupTelemetryChannel();
        workflowListenerRef.current = listenForWorkflowEvents(supabase);
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      if (reconnectTimeouts.current.hitl) clearTimeout(reconnectTimeouts.current.hitl);
      if (reconnectTimeouts.current.telemetry) clearTimeout(reconnectTimeouts.current.telemetry);
      if (hitlChannelRef.current) supabase.removeChannel(hitlChannelRef.current);
      if (telemetryChannelRef.current) supabase.removeChannel(telemetryChannelRef.current);
      if (ticketsChannelRef.current) supabase.removeChannel(ticketsChannelRef.current);
      if (workflowListenerRef.current) workflowListenerRef.current();
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{}}>
      {children}
    </RealtimeContext.Provider>
  );
};
