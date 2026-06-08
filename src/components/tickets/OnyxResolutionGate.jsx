import React, { useState } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../services/supabaseClient';

const { FiCheckCircle, FiAlertCircle, FiMessageSquare } = FiIcons;

const OnyxResolutionGate = ({ ticket, onResolutionComplete }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleAccept = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      // Flip status to Closed
      const { error: ticketError } = await supabase
        .from('support_tickets')
        .update({ status: 'Closed', resolution_notes: 'Resolved automatically by Onyx Mk3' })
        .eq('id', ticket.id);

      if (ticketError) throw ticketError;

      // Log high-confidence match event
      const { error: logError } = await supabase
        .from('api_usage_logs')
        .insert({
          endpoint: 'onyx-resolution-gate/accept',
          app_id: 'AXiM Support System',
          execution_time_ms: 0,
          status_code: 200,
          request_payload: {
            ticket_id: ticket.id,
            action: 'accept_solution',
            confidence_level: 'high_confidence_match_confirmed'
          }
        });

      if (logError) console.error("Logging error", logError);

      if (onResolutionComplete) {
        onResolutionComplete('closed');
      }
    } catch (e) {
      setErrorMsg(`Error accepting solution: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEscalate = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      // Reopen & Escalate
      const { error: ticketError } = await supabase
        .from('support_tickets')
        .update({ status: 'Open', priority: 'High', resolution_notes: 'Escalated by user from pending verification' })
        .eq('id', ticket.id);

      if (ticketError) throw ticketError;

      if (onResolutionComplete) {
        onResolutionComplete('escalated');
      }
    } catch (e) {
      setErrorMsg(`Error escalating ticket: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Find the AI response text
  const aiResponse = ticket.ai_response || ticket.description || "The AI provided a response.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800 rounded-lg border border-slate-700 p-6 shadow-lg mt-4"
    >
      <div className="flex items-start mb-4">
        <div className="bg-purple-900/50 p-2 rounded-full mr-3 text-purple-400">
          <FiMessageSquare className="text-xl" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Onyx Mk3 Proposed Solution</h3>
          <p className="text-sm text-slate-400">Please review the automated response below.</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded border border-slate-700 p-4 text-slate-300 font-mono text-sm mb-6 whitespace-pre-wrap">
        {aiResponse}
      </div>

      {errorMsg && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded mb-4 text-sm flex items-center">
          <FiAlertCircle className="mr-2" />
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleAccept}
          disabled={isProcessing}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white font-medium py-2.5 px-4 rounded transition-colors flex items-center justify-center disabled:opacity-50"
        >
          <FiCheckCircle className="mr-2" />
          Accept Solution & Close Ticket
        </button>
        <button
          onClick={handleEscalate}
          disabled={isProcessing}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-2.5 px-4 rounded transition-colors flex items-center justify-center disabled:opacity-50"
        >
          <FiAlertCircle className="mr-2" />
          Reopen & Escalate to Engineer
        </button>
      </div>
    </motion.div>
  );
};

export default OnyxResolutionGate;
