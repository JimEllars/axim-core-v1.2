import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabase } from '../../contexts/SupabaseContext';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';

const { FiAlertTriangle, FiX } = FiIcons;

const SystemBroadcastModal = () => {
  const { supabase } = useSupabase();
  const [breachedTickets, setBreachedTickets] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Initial fetch of breached tickets
    const fetchBreachedTickets = async () => {
      const { data } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('status', 'Action Required');

      if (data && data.length > 0) {
        setBreachedTickets(data);
        setIsVisible(true);
      }
    };

    fetchBreachedTickets();

    // Subscribe to support_tickets changes
    const subscription = supabase
      .channel('support_tickets_broadcast')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_tickets',
        filter: 'status=eq.Action Required'
      }, (payload) => {
        setBreachedTickets(prev => {
          const exists = prev.find(t => t.id === payload.new.id);
          if (!exists) {
             const newArray = [...prev, payload.new];
             setIsVisible(true);
             return newArray;
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [supabase]);

  if (!isVisible || breachedTickets.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 right-4 bg-onyx-900 border border-red-500 rounded-xl p-4 shadow-2xl z-50 w-80"
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center text-red-500 font-bold">
            <SafeIcon icon={FiAlertTriangle} className="mr-2" />
            SLA BREACH ALERT
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="text-slate-400 hover:text-white"
          >
            <SafeIcon icon={FiX} />
          </button>
        </div>

        <p className="text-sm text-slate-300 mb-2">
          {breachedTickets.length} ticket(s) have decayed in queue and require immediate attention.
        </p>

        <div className="max-h-32 overflow-y-auto space-y-2">
          {breachedTickets.map(ticket => (
            <div key={ticket.id} className="text-xs bg-onyx-800 p-2 rounded border border-red-500/30 text-slate-200">
              <span className="font-semibold">{ticket.subject || 'Unknown Ticket'}</span>
              <div className="text-slate-400 mt-1">ID: {ticket.id}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SystemBroadcastModal;
