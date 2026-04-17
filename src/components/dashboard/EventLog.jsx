import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns/format';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { supabase } from '../../services/supabaseClient';
import { useDashboard } from '../../contexts/DashboardContext';

const { FiActivity, FiRss, FiUser, FiMail, FiDatabase, FiGlobe, FiAlertTriangle, FiXCircle } = FiIcons;

const EventLog = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const { refreshKey } = useDashboard();

  const eventTypes = {
    'new_lead': { icon: FiUser, color: 'text-green-400', bg: 'bg-green-900/20' },
    'email_sent': { icon: FiMail, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    'data_sync': { icon: FiDatabase, color: 'text-purple-400', bg: 'bg-purple-900/20' },
    'api_call': { icon: FiGlobe, color: 'text-orange-400', bg: 'bg-orange-900/20' },
    'workflow_triggered': { icon: FiActivity, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
    'error': { icon: FiXCircle, color: 'text-red-500', bg: 'bg-red-900/30 border-red-500/50' },
    'warning': { icon: FiAlertTriangle, color: 'text-orange-500', bg: 'bg-orange-900/30 border-orange-500/50' }
  };

  const fetchInitialEvents = async () => {
    setLoading(true);
    try {
      // Fetch both local core events and micro-app telemetry (satellite pulses)
      const [eventsResponse, telemetryResponse] = await Promise.all([
        supabase
          .from('events_ax2024')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('satellite_pulses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      if (eventsResponse.error) throw eventsResponse.error;

      const coreEvents = eventsResponse.data || [];
      const telemetryEvents = (telemetryResponse.data || []).map(pulse => ({
        id: pulse.id,
        type: pulse.event_type === 'error' ? 'error' : 'warning',
        source: pulse.satellite_app_id || 'Micro-App',
        created_at: pulse.created_at,
        data: {
          ...pulse.payload,
          ...pulse.telemetry,
          endpoint: pulse.satellite_app_id
        }
      }));

      const combined = [...coreEvents, ...telemetryEvents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
      setEvents(combined);
    } catch (error) {
      console.error('Error fetching initial events:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialEvents();
  }, [refreshKey]);

  useEffect(() => {
    const channel = supabase.channel('events');
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events_ax2024' }, (payload) => {
        setEvents(currentEvents => [payload.new, ...currentEvents].slice(0, 20));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'satellite_pulses' }, (payload) => {
        const pulse = payload.new;
        const newTelemetryEvent = {
          id: pulse.id,
          type: pulse.event_type === 'error' ? 'error' : 'warning',
          source: pulse.satellite_app_id || 'Micro-App',
          created_at: pulse.created_at,
          data: {
            ...pulse.payload,
            ...pulse.telemetry,
            endpoint: pulse.satellite_app_id
          }
        };
        setEvents(currentEvents => [newTelemetryEvent, ...currentEvents].slice(0, 20));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="glass-effect rounded-xl"
    >
      <div className="flex items-center justify-between p-6 border-b border-onyx-accent/20">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
            <SafeIcon icon={FiActivity} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Live Event Log</h3>
            <p className="text-sm text-slate-400">Real-time system activity</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-green-400">
          <FiRss className="animate-pulse" />
          <span className="text-sm font-medium">Live</span>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center space-x-4">
                <div className="w-10 h-10 bg-onyx-950 rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-onyx-950 rounded w-3/4"></div>
                  <div className="h-3 bg-onyx-950 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-hide">
            {events.map((event, index) => {
              // Map severe errors to 'error' or 'warning' style
              let typeKey = event.type;
              if (event.data?.error_code >= 500 || event.type === 'error') typeKey = 'error';
              else if (event.data?.error_code >= 400 || event.type === 'warning') typeKey = 'warning';

              const eventConfig = eventTypes[typeKey] || eventTypes['api_call'];
              
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-center space-x-4 p-4 rounded-lg ${eventConfig.bg} border ${typeKey === 'error' ? 'border-red-500/50' : 'border-onyx-accent/20'} hover:border-onyx-accent/50 transition-colors`}
                >
                  <div className={`w-10 h-10 ${eventConfig.bg} rounded-lg flex items-center justify-center`}>
                    <SafeIcon icon={eventConfig.icon} className={`${eventConfig.color}`} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className={`text-sm font-medium capitalize ${typeKey === 'error' ? 'text-red-400' : 'text-white'}`}>
                        {event.type.replace('_', ' ')} - {event.source || event.data?.endpoint || 'System'}
                      </h4>
                      <span className="text-xs text-slate-400">
                        {format(new Date(event.created_at), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate max-w-[300px]">
                      {event.data?.email && `Email: ${event.data.email}`}
                      {event.data?.name && ` | Name: ${event.data.name}`}
                      {event.data?.workflow_name && `Workflow: ${event.data.workflow_name}`}
                      {event.data?.error_code && `Error ${event.data.error_code}: `}
                      {event.data?.error && `${event.data.error}`}
                      {event.data?.details?.error && `${event.data.details.error}`}
                      {event.data?.message && `${event.data.message}`}
                      {Object.keys(event.data || {}).length === 0 && 'No additional data'}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default EventLog;