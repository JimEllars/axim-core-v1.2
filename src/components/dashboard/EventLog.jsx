import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns/format';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import { supabase } from '../../services/supabaseClient';
import { useDashboard } from '../../contexts/DashboardContext';

const { FiActivity, FiRss, FiUser, FiMail, FiDatabase, FiGlobe } = FiIcons;

const EventLog = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const { refreshKey } = useDashboard();

  const eventTypes = {
    'new_lead': { icon: FiUser, color: 'text-green-400', bg: 'bg-green-900/20' },
    'email_sent': { icon: FiMail, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    'data_sync': { icon: FiDatabase, color: 'text-purple-400', bg: 'bg-purple-900/20' },
    'api_call': { icon: FiGlobe, color: 'text-orange-400', bg: 'bg-orange-900/20' },
    'workflow_triggered': { icon: FiActivity, color: 'text-yellow-400', bg: 'bg-yellow-900/20' }
  };

  const fetchInitialEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('events_ax2024')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setEvents(data || []);
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
              const eventConfig = eventTypes[event.type] || eventTypes['api_call'];
              
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-center space-x-4 p-4 rounded-lg ${eventConfig.bg} border border-onyx-accent/20 hover:border-onyx-accent/50 transition-colors`}
                >
                  <div className={`w-10 h-10 ${eventConfig.bg} rounded-lg flex items-center justify-center`}>
                    <SafeIcon icon={eventConfig.icon} className={`${eventConfig.color}`} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white capitalize">
                        {event.type.replace('_', ' ')} - {event.source}
                      </h4>
                      <span className="text-xs text-slate-400">
                        {format(new Date(event.created_at), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {event.data?.email && `Email: ${event.data.email}`}
                      {event.data?.name && ` | Name: ${event.data.name}`}
                      {event.data?.workflow_name && `Workflow: ${event.data.workflow_name}`}
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