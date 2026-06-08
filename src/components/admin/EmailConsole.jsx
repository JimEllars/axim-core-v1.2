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

  useEffect(() => {
    fetchDlqItems();
  }, []);

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

      const result = await response.json();
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

  const handleRetryDlq = async (item) => {
    // Send email again
    try {
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
            app_source: 'AXiM DLQ Retry'
            })
        });

        if (response.ok) {
            // Remove from DLQ
            await supabase.from('email_dead_letter_queue').delete().eq('id', item.id);
            fetchDlqItems();
        } else {
            alert("Retry failed again. Please check logs.");
        }
    } catch (e) {
        alert("Retry error: " + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
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
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">HTML Body</label>
            <textarea
              rows={4}
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
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
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-medium flex items-center transition-colors disabled:opacity-50"
            >
              {isSending ? <FiRefreshCw className="mr-2 animate-spin" /> : <FiSend className="mr-2" />}
              Send Ping to Operator
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center">
            <FiAlertCircle className="mr-2 text-orange-400" />
            Dead-Letter Queue (DLQ)
          </h2>

          <button
            onClick={fetchDlqItems}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <FiRefreshCw className={isLoadingDlq ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoadingDlq ? (
          <div className="text-center py-8 text-slate-400">Loading DLQ items...</div>
        ) : dlqItems.length === 0 ? (
          <div className="text-center py-8 text-slate-400 border border-slate-700 border-dashed rounded-lg bg-slate-900/50">
            Queue is empty. All messages delivered.
          </div>
        ) : (
          <div className="space-y-3">
            {dlqItems.map(item => (
              <div key={item.id} className="bg-slate-900 rounded-md p-4 border border-red-900/50 flex justify-between items-start">
                <div>
                  <h3 className="text-white font-medium">{item.subject}</h3>
                  <div className="text-sm text-slate-400 mt-1">To: {item.to_email}</div>
                  <div className="text-xs text-red-400 mt-2 font-mono break-all">{item.error_diagnostic}</div>
                  <div className="text-xs text-slate-500 mt-1">{new Date(item.created_at).toLocaleString()}</div>
                </div>
                <button
                  onClick={() => handleRetryDlq(item)}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center"
                >
                  <FiRefreshCw className="mr-1.5" />
                  Retry
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailConsole;
