/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabaseClient';
import OnyxResolutionGate from '../components/tickets/OnyxResolutionGate';

const Support = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);


  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTickets(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();

  }, []);


  const handleResolutionComplete = () => {
    fetchTickets();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Support Dashboard</h1>
      {loading ? (
        <div>Loading tickets...</div>
      ) : (
        <div className="space-y-6">
          {tickets.map(ticket => (
            <div key={ticket.id} className="bg-slate-800 p-6 rounded-lg border border-slate-700">
              <h2 className="text-xl font-semibold mb-2">{ticket.subject}</h2>
              <p className="text-slate-400 mb-4">{ticket.description}</p>
              <div className="flex space-x-4 mb-4">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  ticket.status === 'pending_user_verification' ? 'bg-yellow-500/20 text-yellow-500' :
                  ticket.status === 'Closed' ? 'bg-green-500/20 text-green-500' :
                  'bg-blue-500/20 text-blue-500'
                }`}>
                  {ticket.status}
                </span>
                <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-700 text-slate-300">
                  Priority: {ticket.priority}
                </span>
              </div>
              {ticket.status === 'pending_user_verification' && (
                <OnyxResolutionGate ticket={ticket} onResolutionComplete={handleResolutionComplete} />
              )}
            </div>
          ))}
          {tickets.length === 0 && (
            <div className="text-slate-500 text-center py-8">No tickets found.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Support;
