cat << 'INNER_EOF' > src/contexts/RealtimeContext.jsx
import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import toast from 'react-hot-toast';
import { listenForWorkflowEvents } from '../services/workflowListener';
import { useAuth } from './AuthContext'; // Updated from useAuthStore based on memory hints

const RealtimeContext = createContext({});

export const useRealtime = () => useContext(RealtimeContext);

const RealtimeProvider = ({ children }) => {
  const { user } = useAuth();
  const hitlChannelRef = useRef(null);
  const telemetryChannelRef = useRef(null);
  const ticketsChannelRef = useRef(null);
  const workflowChannelRef = useRef(null);
  const execChannelRef = useRef(null);
  const workflowListenerRef = useRef(null);
  const reconnectTimeouts = useRef({
    hitl: null,
    telemetry: null,
    workflow: null,
    exec: null
  });

  // Track toast times outside of useEffect so they persist across re-renders
  const lastToastTimes = useRef({
      support_tickets: 0,
      hitl_audit_logs: 0
  });

  const pendingToasts = useRef({
      support_tickets: 0,
      hitl_audit_logs: 0
  });

  useEffect(() => {
    if (!user || !supabase) return;

    let hitlRetries = 0;
    let telemetryRetries = 0;
    let workflowRetries = 0;
    let execRetries = 0;
    const MAX_RETRIES = 3;
    const currentReconnectTimeouts = reconnectTimeouts.current;

    const triggerThrottledToast = (type, defaultMessage, multipleMessage, duration, id) => {
        const now = Date.now();
        const lastTime = lastToastTimes.current[type] || 0;

        if (now - lastTime < 10000) {
            pendingToasts.current[type] += 1;
        } else {
            const count = pendingToasts.current[type] + 1;
            const message = count > 1 ? multipleMessage.replace('{count}', count) : defaultMessage;
            toast.error(message, { duration, id });

            lastToastTimes.current[type] = now;
            pendingToasts.current[type] = 0;

            setTimeout(() => {
                if (pendingToasts.current[type] > 0) {
                    const finalCount = pendingToasts.current[type];
                    const finalMessage = finalCount > 1 ? multipleMessage.replace('{count}', finalCount) : defaultMessage;
                    toast.error(finalMessage, { duration, id: id + '-delayed' });
                    lastToastTimes.current[type] = Date.now();
                    pendingToasts.current[type] = 0;
                }
            }, 10000);
        }
    };

    const setupSupportTicketsChannel = () => {
      const ticketsChannel = supabase.channel('realtime:support_tickets')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'support_tickets' },
          (payload) => {
            triggerThrottledToast('support_tickets', 'System Degradation Detected: Node isolated. Onyx RCA initiated.', 'Multiple System Degradations Detected', 5000, 'support_tickets_toast');
          }
        ).subscribe((status, err) => {
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                console.warn('RealtimeContext: WebSocket connection closed/error (support_tickets)', err || status);
            }
        });

      ticketsChannel.onError((err) => {
          console.warn('RealtimeContext: WebSocket error (support_tickets)', err);
      });

      ticketsChannelRef.current = ticketsChannel;
    };

    const setupHitlChannel = () => {
      const hitlChannel = supabase.channel('realtime:hitl_audit_logs')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'hitl_audit_logs' },
          (payload) => {
            if (payload.new.status.toLowerCase() === 'pending') {
              triggerThrottledToast('hitl_audit_logs', 'Action Required: Tier 4 Agent proposes deployment. Human authorization needed.', 'Multiple Actions Required: Tier 4 Agent proposes deployment. Human authorization needed.', 5000, 'hitl_audit_logs_toast');
            }
          }
        ).subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            hitlRetries = 0;
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('RealtimeContext: WebSocket connection closed/error (hitl_audit_logs)', err || status);
            if (hitlRetries < MAX_RETRIES) {
              hitlRetries++;
              const backoffTime = Math.pow(2, hitlRetries) * 1000;
              currentReconnectTimeouts.hitl = setTimeout(setupHitlChannel, backoffTime);
            } else {
              toast.error('Disconnected from HITL live updates.', { id: 'offline-hitl' });
            }
          }
        });

      hitlChannel.onError((err) => {
          console.warn('RealtimeContext: WebSocket error (hitl_audit_logs)', err);
      });

      hitlChannelRef.current = hitlChannel;
    };

    const setupTelemetryChannel = () => {
      const telemetryChannel = supabase.channel('realtime:telemetry_events')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'telemetry_events' },
          (payload) => {
              const isError = payload.new?.severity === 'ERROR' || payload.new?.severity === 'FATAL';
              if (isError) {
                  toast.error(`System Event: ${payload.new.severity} in ${payload.new.component_id}`, {
                      style: { background: '#7f1d1d', color: '#fff', border: '1px solid #ef4444' }
                  });
              }
              window.dispatchEvent(new CustomEvent('axim:telemetry_update', { detail: payload }));
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            telemetryRetries = 0;
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('RealtimeContext: WebSocket connection closed/error (telemetry_events)', err || status);
            if (telemetryRetries < MAX_RETRIES) {
              telemetryRetries++;
              const backoffTime = Math.pow(2, telemetryRetries) * 1000;
              currentReconnectTimeouts.telemetry = setTimeout(setupTelemetryChannel, backoffTime);
            } else {
              toast.error('Disconnected from telemetry live updates.', { id: 'offline-telemetry' });
            }
          }
        });

      telemetryChannel.onError((err) => {
          console.warn('RealtimeContext: WebSocket error (telemetry_events)', err);
      });

      telemetryChannelRef.current = telemetryChannel;
    };

    const setupExecChannel = () => {
      const execChannel = supabase.channel('realtime:micro_app_executions')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'micro_app_executions' },
          (payload) => {
              window.dispatchEvent(new CustomEvent('axim:exec_update', { detail: payload }));
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            execRetries = 0;
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('RealtimeContext: WebSocket connection closed/error (micro_app_executions)', err || status);
            if (execRetries < MAX_RETRIES) {
              execRetries++;
              const backoffTime = Math.pow(2, execRetries) * 1000;
              currentReconnectTimeouts.exec = setTimeout(setupExecChannel, backoffTime);
            }
          }
        });

      execChannel.onError((err) => {
          console.warn('RealtimeContext: WebSocket error (micro_app_executions)', err);
      });

      execChannelRef.current = execChannel;
    };

    const setupWorkflowChannel = () => {
      const workflowChannel = supabase.channel('realtime:telemetry_alert_bus')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'telemetry_events' },
          (payload) => {
             window.dispatchEvent(new CustomEvent('workflow:new_execution', { detail: payload.new }));
          }
        )
        .subscribe((status, err) => {
           if (status === 'SUBSCRIBED') {
             workflowRetries = 0;
           } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              console.warn('RealtimeContext: WebSocket connection closed/error (telemetry_events)', err || status);
              if (workflowRetries < MAX_RETRIES) {
                workflowRetries++;
                const backoffTime = Math.pow(2, workflowRetries) * 1000;
                currentReconnectTimeouts.workflow = setTimeout(setupWorkflowChannel, backoffTime);
              } else {
                toast.error('Disconnected from workflow live updates.', { id: 'offline-workflow' });
              }
           }
        });

      workflowChannel.onError((err) => {
          console.warn('RealtimeContext: WebSocket error (telemetry_events)', err);
      });
      workflowChannelRef.current = workflowChannel;
    };

    setupWorkflowChannel();
    setupSupportTicketsChannel();
    setupHitlChannel();
    setupTelemetryChannel();
    setupExecChannel();
    workflowListenerRef.current = listenForWorkflowEvents(supabase);

    const handleOnline = () => {
        if (hitlChannelRef.current) supabase.removeChannel(hitlChannelRef.current);
        if (telemetryChannelRef.current) supabase.removeChannel(telemetryChannelRef.current);
        if (ticketsChannelRef.current) supabase.removeChannel(ticketsChannelRef.current);
        if (workflowChannelRef.current) supabase.removeChannel(workflowChannelRef.current);
        if (execChannelRef.current) supabase.removeChannel(execChannelRef.current);
        if (workflowListenerRef.current) workflowListenerRef.current();

        setupSupportTicketsChannel();
        setupHitlChannel();
        setupTelemetryChannel();
        setupWorkflowChannel();
        setupExecChannel();
        workflowListenerRef.current = listenForWorkflowEvents(supabase);
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      if (currentReconnectTimeouts.hitl) clearTimeout(currentReconnectTimeouts.hitl);
      if (currentReconnectTimeouts.telemetry) clearTimeout(currentReconnectTimeouts.telemetry);
      if (currentReconnectTimeouts.workflow) clearTimeout(currentReconnectTimeouts.workflow);
      if (currentReconnectTimeouts.exec) clearTimeout(currentReconnectTimeouts.exec);
      if (hitlChannelRef.current) supabase.removeChannel(hitlChannelRef.current);
      if (telemetryChannelRef.current) supabase.removeChannel(telemetryChannelRef.current);
      if (ticketsChannelRef.current) supabase.removeChannel(ticketsChannelRef.current);
      if (workflowChannelRef.current) supabase.removeChannel(workflowChannelRef.current);
      if (execChannelRef.current) supabase.removeChannel(execChannelRef.current);
      if (workflowListenerRef.current) workflowListenerRef.current();
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{}}>
      {children}
    </RealtimeContext.Provider>
  );
};

export { RealtimeProvider };
INNER_EOF
