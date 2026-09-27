import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiSearch, FiMessageSquare, FiLoader, FiZap, FiActivity, FiSettings, FiFileText, FiWifi, FiDownload, FiUpload, FiClock } from 'react-icons/fi';
import toast from 'react-hot-toast';

const IntelligenceHub = () => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [ragResult, setRagResult] = useState(null);
  const [error, setError] = useState(null);

  const { user, settings: userConfig } = useAuth();
  const { supabase, session } = useSupabase();
  const [liveStream, setLiveStream] = useState([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [selectedModel, setSelectedModel] = useState('claude-3-haiku-20240307');
  const [networkStats, setNetworkStats] = useState(null);
  const [isNetworkLoading, setIsNetworkLoading] = useState(true);

  useEffect(() => {
    if (userConfig?.default_model) {
      setSelectedModel(userConfig.default_model);
    }
  }, [userConfig]);

  useEffect(() => {
    const fetchNetworkStats = async () => {
      if (!supabase) return;
      try {
        const { data, error } = await supabase.rpc('get_speedreport_telemetry_summary');
        if (error) throw error;
        setNetworkStats(data);
      } catch (err) {
        console.error('Failed to fetch network stats:', err);
      } finally {
        setIsNetworkLoading(false);
      }
    };
    fetchNetworkStats();
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel('realtime:ai_interactions_ax2024')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_interactions_ax2024' },
        (payload) => {
          const newEntry = {
            id: payload.new.id,
            content: payload.new.command || payload.new.response || 'Interaction logged',
            source_type: payload.new.source || 'AXiM Core',
            created_at: payload.new.created_at
          };
          setLiveStream((prev) => [newEntry, ...prev].slice(0, 10)); // Keep only the latest 10 items
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnecting(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (!user?.id) {
        toast.error('User not authenticated.');
        return;
    }

    setIsSearching(true);
    setError(null);
    setRagResult(null);

    try {
      let provider = 'claude';
      if (selectedModel.includes('gpt')) provider = 'openai';

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-qa`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || user?.token}`
        },
        body: JSON.stringify({
            query: query,
            user_id: user.id,
            provider: provider
        })
      });

      if (!response.ok) {
         if (response.status === 502) {
             throw new Error("Upstream AI provider is currently unreachable.");
         }
         throw new Error(`Failed to query Intelligence Hub: ${response.statusText}`);
      }

      const data = await response.json();
      setRagResult(data);

    } catch (err) {
        setError(err.message || "Failed to search intelligence hub.");
        toast.error('Failed to search intelligence hub.');
    } finally {
        setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6 min-h-[160px]" style={{ background: 'rgba(10, 10, 12, 0.45)', backdropFilter: 'blur(16px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect rounded-xl p-6"
      >
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              <SafeIcon icon={FiZap} className="mr-2 text-indigo-400" />
              Intelligence Hub (RAG)
            </h2>
            <p className="text-sm text-slate-400">Ask questions based on your ingested ecosystem memory.</p>
          </div>
          <div className="flex items-center space-x-2">
            <SafeIcon icon={FiSettings} className="text-slate-500" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-onyx-950 border border-onyx-accent/20 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
              <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o-mini</option>
            </select>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your knowledge base..."
              className="w-full bg-onyx-950 border border-onyx-accent/20 rounded-lg px-4 py-3 pl-10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500 transition-colors"
            />
            <SafeIcon icon={FiSearch} className="absolute left-3 top-3.5 text-slate-500" />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-2 top-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {isSearching ? <SafeIcon icon={FiLoader} className="animate-spin" /> : 'Ask'}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-4 mb-4 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {ragResult ? (
            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="bg-onyx-950/50 rounded-lg border border-indigo-500/30 overflow-hidden"
            >
               <div className="p-5 border-b border-onyx-accent/20 bg-indigo-900/20">
                  <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider mb-2 flex items-center">
                     <SafeIcon icon={FiZap} className="mr-2" /> AI Response
                  </h3>
                  <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                      {ragResult.answer}
                  </div>
               </div>

               {ragResult.sources && ragResult.sources.length > 0 && (
                   <div className="p-5 bg-onyx-950/80">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                          <SafeIcon icon={FiFileText} className="mr-2" /> Context References
                      </h4>
                      <div className="space-y-3">
                         {ragResult.sources.map((source, idx) => (
                             <div key={idx} className="p-3 bg-onyx-900/50 rounded border border-onyx-accent/10 flex items-start">
                                 <span className="text-indigo-400 font-mono text-xs mr-3 mt-0.5">[{idx + 1}]</span>
                                 <div className="flex-1">
                                    <p className="text-xs text-slate-400 line-clamp-2">{source.content}</p>
                                    {source.similarity && (
                                        <div className="mt-1 text-[10px] text-green-400/80">Match: {(source.similarity * 100).toFixed(1)}%</div>
                                    )}
                                 </div>
                             </div>
                         ))}
                      </div>
                   </div>
               )}
            </motion.div>
          ) : (
            !isSearching && query && !error && (
               <div className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
                  Ask a question to search your intelligence logs.
               </div>
            )
          )}
        </div>
      </motion.div>

      {/* Live Ingestion Stream */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect rounded-xl p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center">
              <SafeIcon icon={FiActivity} className="mr-2 text-green-400" />
              Live Ingestion Stream
            </h2>
            <p className="text-sm text-slate-400">Real-time Onyx knowledge ingestion feed.</p>
          </div>
          <div className="flex items-center space-x-2">
             <span className="relative flex h-3 w-3">
              {!isConnecting && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnecting ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
            </span>
            {isConnecting ? (
              <span className="text-xs text-yellow-400 font-medium flex items-center">
                <SafeIcon icon={FiLoader} className="animate-spin mr-1" size={12} /> Connecting...
              </span>
            ) : (
              <span className="text-xs text-green-400 font-medium">Listening</span>
            )}
          </div>
        </div>

        <div className="bg-onyx-950/50 rounded-lg border border-onyx-accent/20 p-4 h-64 overflow-y-auto">
          {liveStream.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm italic">
              {isConnecting ? 'Establishing secure connection...' : 'Waiting for new intelligence to be ingested...'}
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {liveStream.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="text-sm text-slate-300 border-l-2 border-indigo-500 pl-3 py-1 bg-onyx-900/50 rounded-r"
                  >
                    <span className="text-slate-500 mr-2">[{new Date(item.created_at).toLocaleTimeString()}]</span>
                    Onyx ingested: <span className="font-semibold text-indigo-300">{item.source_type}</span> regarding "{item.content.substring(0, 50)}..."
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {/* Edge Network & ISP Intelligence Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-effect rounded-xl p-6"
        style={{ background: '#0B0F17', borderColor: '#1e293b' }}
      >
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              <SafeIcon icon={FiWifi} className="mr-2 text-cyan-500" />
              Edge Network & ISP Intelligence
            </h2>
            <p className="text-sm text-slate-400">Real-time performance metrics across commercial ISP connections.</p>
          </div>
          {isNetworkLoading && <SafeIcon icon={FiLoader} className="text-cyan-500 animate-spin" />}
        </div>

        {!isNetworkLoading && networkStats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center text-slate-400 mb-2">
                  <SafeIcon icon={FiActivity} className="mr-2 text-yellow-500" />
                  <span className="text-xs uppercase tracking-wider font-semibold">Total Audits</span>
                </div>
                <div className="text-2xl font-bold text-yellow-500">
                  {networkStats.total_audits ? networkStats.total_audits.toLocaleString() : '0'}
                </div>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center text-slate-400 mb-2">
                  <SafeIcon icon={FiDownload} className="mr-2 text-cyan-500" />
                  <span className="text-xs uppercase tracking-wider font-semibold">Avg Throughput</span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <div className="text-2xl font-bold text-cyan-500">
                    {networkStats.avg_download ? Math.round(networkStats.avg_download) : '0'} <span className="text-sm font-normal text-slate-500">↓</span>
                  </div>
                  <div className="text-2xl font-bold text-cyan-500">
                    {networkStats.avg_upload ? Math.round(networkStats.avg_upload) : '0'} <span className="text-sm font-normal text-slate-500">↑</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">Mbps</div>
                </div>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
                <div className="flex items-center text-slate-400 mb-2">
                  <SafeIcon icon={FiClock} className="mr-2 text-cyan-500" />
                  <span className="text-xs uppercase tracking-wider font-semibold">Fleet Edge Latency</span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <div className="text-2xl font-bold text-cyan-500">
                    {networkStats.avg_latency ? Math.round(networkStats.avg_latency) : '0'} <span className="text-xs font-normal text-slate-500">ms</span>
                  </div>
                  <div className="text-sm text-slate-400 ml-2">
                    Jitter: <span className="text-yellow-500">{networkStats.avg_jitter ? Math.round(networkStats.avg_jitter) : '0'} ms</span>
                  </div>
                </div>
              </div>
            </div>

            {networkStats.top_isps && networkStats.top_isps.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">ISP Leaderboard</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-400">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-800/30 border-b border-slate-700">
                      <tr>
                        <th className="px-4 py-3 font-medium">ISP Provider</th>
                        <th className="px-4 py-3 font-medium">Avg Download</th>
                        <th className="px-4 py-3 font-medium">Avg Upload</th>
                        <th className="px-4 py-3 font-medium text-right">Samples</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 bg-slate-900/20">
                      {networkStats.top_isps.map((isp, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-300">{isp.isp_name}</td>
                          <td className="px-4 py-3 text-cyan-400">{Math.round(isp.avg_download)} Mbps</td>
                          <td className="px-4 py-3 text-cyan-400">{Math.round(isp.avg_upload)} Mbps</td>
                          <td className="px-4 py-3 text-right text-yellow-500 font-mono">{isp.sample_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : !isNetworkLoading ? (
           <div className="text-center p-8 text-slate-500 border border-dashed border-slate-700 rounded-lg">
             No network intelligence data available.
           </div>
        ) : null}
      </motion.div>
    </div>
  );
};

export default IntelligenceHub;
