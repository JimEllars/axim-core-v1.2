import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import api from '../../services/onyxAI/api';

const { FiMessageSquare, FiTrendingUp, FiCpu, FiX } = FiIcons;

const ProductFeedback = () => {
  const { supabase } = useSupabase();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState(null);

  const [newFeedback, setNewFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitFeedback = async () => {
    if (!newFeedback.trim()) return;
    setSubmitting(true);
    try {
      let diagnostics = null;
      if (window.electronAPI && window.electronAPI.getSystemDiagnostics) {
        diagnostics = await window.electronAPI.getSystemDiagnostics();
      }

      await api.submitProductFeedback({
          app_source: 'desktop-client',
          sentiment: 'neutral',
          comments: newFeedback,
          diagnostics: diagnostics
        });
      const error = null;

      if (error) throw error;
      setNewFeedback('');
      // Refresh list
      const data = await api.getProductFeedback();
      if (data) setFeedback(data);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
    setSubmitting(false);
  };


  useEffect(() => {
    const fetchFeedback = async () => {
      setLoading(true);
      if (window !== undefined) {
        const data = await api.getProductFeedback();
          const error = null;
        if (!error && data) {
          setFeedback(data);
        }
      }
      setLoading(false);
    };

    fetchFeedback();
  }, []);

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummary(null);
    try {
      const payload = {
        command: "Summarize recent user feedback and suggest improvements",
        context: { feedback }
      };
      const result = await api.sendToOnyxWorker(payload);
      if (result && result.response) {
        setSummary(result.response);
      } else {
        setSummary("No response from ProdBot.");
      }
    } catch (err) {
      setSummary("Failed to fetch summary from ProdBot: " + err.message);
    }
    setSummarizing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center glass-effect rounded-xl p-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center">
            <SafeIcon icon={FiMessageSquare} className="mr-2 text-indigo-400" />
            Product Feedback
          </h2>
          <p className="text-sm text-slate-400">User feedback and sentiment across micro-apps.</p>
        </div>
        <button
          onClick={handleSummarize}
          disabled={summarizing || feedback.length === 0}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center disabled:opacity-50"
        >
          <SafeIcon icon={FiCpu} className="mr-2" />
          {summarizing ? 'Summarizing...' : 'Summarize with ProdBot'}
        </button>
      </div>

      <AnimatePresence>
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-effect rounded-xl p-6 relative border border-indigo-500/30"
          >
            <button
              onClick={() => setSummary(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <SafeIcon icon={FiX} />
            </button>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center">
              <SafeIcon icon={FiTrendingUp} className="mr-2 text-indigo-400" />
              ProdBot Analysis
            </h3>
            <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
              {summary}
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      <div className="glass-effect rounded-xl p-6 flex flex-col space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center">
          <SafeIcon icon={FiMessageSquare} className="mr-2 text-indigo-400" />
          Submit Feedback
        </h3>
        <textarea
          className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
          rows="3"
          placeholder="Describe your issue or suggestion..."
          value={newFeedback}
          onChange={(e) => setNewFeedback(e.target.value)}
        />
        <button
          onClick={handleSubmitFeedback}
          disabled={submitting || !newFeedback.trim()}
          className="self-end bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>

      <div className="glass-effect rounded-xl overflow-hidden">

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-onyx-950/50">
              <tr>
                <th className="px-6 py-4 rounded-tl-lg">Date</th>
                <th className="px-6 py-4">App Source</th>
                <th className="px-6 py-4">Sentiment</th>
                <th className="px-6 py-4 rounded-tr-lg">Comments</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="text-center py-8">
                    <div className="animate-pulse flex space-x-4 justify-center items-center">
                      <div className="w-4 h-4 bg-indigo-500 rounded-full"></div>
                      <div className="w-4 h-4 bg-indigo-500 rounded-full animation-delay-200"></div>
                      <div className="w-4 h-4 bg-indigo-500 rounded-full animation-delay-400"></div>
                    </div>
                  </td>
                </tr>
              ) : feedback.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-slate-500">
                    No feedback available yet.
                  </td>
                </tr>
              ) : (
                feedback.map((item) => (
                  <tr key={item.id} className="border-b border-onyx-accent/10 hover:bg-onyx-950/30">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {item.app_source}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        item.sentiment === 'positive' ? 'bg-green-500/20 text-green-400' :
                        item.sentiment === 'negative' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {item.sentiment}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-md truncate">
                      {item.comments}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductFeedback;
