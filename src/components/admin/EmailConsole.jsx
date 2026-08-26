import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import * as FiIcons from 'react-icons/fi';
import { supabase } from '../../services/supabaseClient';

const { FiMail, FiSend, FiAlertCircle, FiRefreshCw, FiCheckCircle } = FiIcons;

const EmailConsole = () => {
  const { session } = useAuth();
  const [subject, setSubject] = useState('Test Operator Ping');
  const [htmlContent, setHtmlContent] = useState('<p>This is a secure ping from the AXiM Admin Console.</p>');
  const [isSending, setIsSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const [dlqItems, setDlqItems] = useState([]);
  const [isLoadingDlq, setIsLoadingDlq] = useState(true);

  const fetchDlqItems = async () => {
    setIsLoadingDlq(true);
    try {
      const { data, error } = await supabase
        .from('email_dead_letter_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching DLQ:', error);
      } else {
        setDlqItems(data || []);
      }
    } catch (e) {
      console.error('Exception fetching DLQ:', e);
    } finally {
      setIsLoadingDlq(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDlqItems();
  }, []);

  const handleSendPing = async () => {
    setIsSending(true);
    setStatusMsg(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          to_email: 'jrellars@gmail.com',
          subject: subject,
          html_content: htmlContent,
          app_source: 'AXiM Admin Console'
        })
      });

      // eslint-disable-next-line react-hooks/purity
      const startTime = Date.now();
      const result = await response.json();
      const endTime = Date.now();

      try {
        await supabase.from('api_usage_logs').insert({
            endpoint: '/send-email/test-ping',
            status_code: response.ok ? 200 : response.status,
            compute_ms: endTime - startTime,
            app_id: 'axim-admin-console',
            payload: { subject, type: 'operator-ping' }
        });
      } catch (logErr) {
        console.error("Telemetry logging failed", logErr);
      }

      if (response.ok) {
        setStatusMsg({ type: 'success', text: 'Ping sent successfully to jrellars@gmail.com!' });
      } else {
        setStatusMsg({ type: 'error', text: `Failed to send ping: ${result.error || response.statusText}` });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: `Network error: ${e.message}` });
    } finally {
      setIsSending(false);
    }
  };

  const handleReplayTransaction = async (item) => {
    // Send email again
    try {
        // eslint-disable-next-line react-hooks/purity
        const startTime = Date.now();

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
            to_email: item.to_email,
            subject: item.subject,
            html_content: item.html_content,
            app_source: 'AXiM DLQ Replay Transaction'
            })
        });

        // eslint-disable-next-line react-hooks/purity
        const replayEndTime = Date.now();
        try {
            await supabase.from('api_usage_logs').insert({
                endpoint: '/send-email/dlq-replay',
                status_code: response.ok ? 200 : response.status,
                compute_ms: replayEndTime - startTime,
                app_id: 'axim-admin-console',
                payload: { replay_item_id: item.id }
            });
        } catch (logErr) {
            console.error("Telemetry logging failed", logErr);
        }

        if (response.ok) {
            // Remove from DLQ
            await supabase.from('email_dead_letter_queue').delete().eq('id', item.id);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchDlqItems();
        } else {
            alert("Replay Transaction failed again. Please check logs.");
        }
    } catch (e) {
        alert("Replay Transaction error: " + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect rounded-2xl p-6 min-h-[160px] shadow-[0_0_25px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}
      >
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
          <FiMail className="mr-2 text-blue-400" />
          Direct Operator Ping
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">HTML Body</label>
            <textarea
              rows={4}
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-sm transition-colors"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 gap-4">
            <div>
              {statusMsg && (
                <div className={`text-sm flex items-center ${statusMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {statusMsg.type === 'success' ? <FiCheckCircle className="mr-1" /> : <FiAlertCircle className="mr-1" />}
                  {statusMsg.text}
                </div>
              )}
            </div>

            <button
              onClick={handleSendPing}
              disabled={isSending}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium flex items-center transition-all disabled:opacity-50"
            >
              {isSending ? <FiRefreshCw className="mr-2 animate-spin" /> : <FiSend className="mr-2" />}
              Send Ping to Operator
            </button>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-effect rounded-2xl p-6 min-h-[160px] shadow-[0_0_25px_rgba(0,0,0,0.5)]"
        style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center">
            <FiAlertCircle className="mr-2 text-orange-400" />
            Dead-Letter Queue (DLQ)
          </h2>

          <button
            onClick={fetchDlqItems}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800"
          >
            <FiRefreshCw className={isLoadingDlq ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoadingDlq ? (
          <div className="space-y-4 py-2">
            {[1, 2].map(i => (
                <div key={i} className="animate-pulse bg-slate-900/50 rounded-xl p-4 border border-slate-800 flex justify-between items-start">
                    <div className="space-y-3 flex-1 mr-4">
                        <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                        <div className="h-3 bg-slate-800 rounded w-1/4"></div>
                        <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                    </div>
                    <div className="h-8 w-32 bg-slate-800 rounded-lg"></div>
                </div>
            ))}
          </div>
        ) : dlqItems.length === 0 ? (
          <div className="text-center py-10 text-slate-400 border border-slate-700/50 border-dashed rounded-xl bg-slate-900/30">
            Queue is empty. All messages delivered successfully.
          </div>
        ) : (
          <div className="space-y-4">
            {dlqItems.map(item => (
              <div key={item.id} className="bg-slate-900/80 rounded-xl p-5 border border-red-900/30 flex flex-col sm:flex-row justify-between items-start gap-4 transition-all hover:border-red-900/60">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400 border border-red-900/50">
                      Bounced
                    </span>
                    <h3 className="text-white font-medium text-sm">{item.subject}</h3>
                  </div>
                  <div className="text-sm text-slate-400 mt-2">To: <span className="text-slate-300">{item.to_email}</span></div>
                  <div className="text-xs text-red-400/80 mt-2 font-mono break-all bg-red-950/20 p-2 rounded border border-red-900/20">
                    {item.error_diagnostic}
                  </div>
                  <div className="text-xs text-slate-500 mt-3">{new Date(item.created_at).toLocaleString()}</div>
                </div>
                <button
                  onClick={() => handleReplayTransaction(item)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm transition-all flex items-center border border-slate-700 hover:border-slate-600 w-full sm:w-auto justify-center whitespace-nowrap"
                >
                  <FiRefreshCw className="mr-2" />
                  Replay Transaction
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default EmailConsole;
