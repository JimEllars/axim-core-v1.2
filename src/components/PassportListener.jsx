import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from './common/SafeIcon';

const { FiShield, FiCheckCircle, FiXCircle, FiClock } = FiIcons;

const PassportListener = () => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const channel = supabase.channel('passport-verify-events');

    channel
      .on('broadcast', { event: 'verification_status' }, (payload) => {
        setEvents((currentEvents) => [
          {
            id: Date.now() + Math.random(),
            status: payload.payload.status,
            user_id: payload.payload.user_id,
            timestamp: new Date().toISOString(),
          },
          ...currentEvents,
        ].slice(0, 10));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusConfig = (status) => {
    switch (status) {
      case 'verified':
        return { icon: FiCheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-900/20' };
      case 'failed':
        return { icon: FiXCircle, color: 'text-red-400', bg: 'bg-red-900/20' };
      case 'pending':
        return { icon: FiClock, color: 'text-amber-400', bg: 'bg-amber-900/20' };
      default:
        return { icon: FiShield, color: 'text-slate-400', bg: 'bg-slate-900/20' };
    }
  };

  return (
    <div className="bg-onyx-950 border border-onyx-accent/20 rounded-xl p-4">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
        <SafeIcon icon={FiShield} className="mr-2 text-indigo-400" />
        Passport Verifications
      </h3>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No recent verifications.</p>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {events.map((event) => {
              const config = getStatusConfig(event.status);
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center space-x-3 p-3 rounded-lg border border-onyx-accent/10 ${config.bg}`}
                >
                  <SafeIcon icon={config.icon} className={config.color} />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium capitalize">{event.status}</p>
                    <p className="text-xs text-slate-400 truncate">User: {event.user_id || 'Unknown'}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default PassportListener;
