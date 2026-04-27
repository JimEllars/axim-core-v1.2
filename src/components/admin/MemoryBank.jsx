import React, { useState, useEffect } from 'react';
import { useVectorSearch } from '../../hooks/useVectorSearch';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiSearch, FiMessageSquare, FiCalendar, FiLoader, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const MemoryBank = () => {
  const [query, setQuery] = useState('');
  const { searchMemory, isSearching, results, error } = useVectorSearch();
  const { user, supabase } = useSupabase();
  const [feed, setFeed] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  useEffect(() => {
    const fetchRecentMemories = async () => {
      if (!supabase) return;
      setLoadingFeed(true);
      try {
        const { data, error } = await supabase
          .from('memory_banks')
          .select('*')
          .order('summary_date', { ascending: false })
          .limit(10);
        if (error) throw error;
        setFeed(data || []);
      } catch (err) {
        toast.error('Failed to load recent memories.');
      } finally {
        setLoadingFeed(false);
      }
    };
    if (!query) {
      fetchRecentMemories();
    }
  }, [supabase, query]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (!user?.id) {
        toast.error('User not authenticated.');
        return;
    }

    try {
      await searchMemory(query, user.id);
    } catch (err) {
        toast.error('Failed to search memory banks.');
    }
  };

  return (
    <div className="bg-onyx-950 rounded-lg p-6 border border-onyx-accent/20 w-full shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center">
          <SafeIcon icon={FiZap} className="mr-3 text-indigo-400" />
          Mission Control: Cognitive Memory Bank
        </h2>
        <p className="text-sm text-slate-400 mt-2">Access and query the AI's long-term memory, strategic context, and interaction summaries.</p>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search overarching strategies or granular chat memories..."
            className="w-full bg-onyx-900 border border-onyx-accent/30 rounded-lg px-4 py-3 pl-10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
          />
          <SafeIcon icon={FiSearch} className="absolute left-3 top-3.5 text-slate-500" />
          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-2 top-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50 flex items-center"
          >
            {isSearching ? <SafeIcon icon={FiLoader} className="animate-spin" /> : 'Deep Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 mb-4 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {query ? (
          // Search Results View
          <AnimatePresence>
            {results?.strategic_context?.length > 0 || results?.chat_context?.length > 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

                {/* Strategic Context */}
                {results.strategic_context?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-3 border-b border-indigo-900/50 pb-2">Strategic Memory</h3>
                    <div className="space-y-4">
                      {results.strategic_context.map((mem, idx) => (
                        <div key={`strat-${idx}`} className="p-5 bg-onyx-900/80 rounded-lg border border-indigo-500/30">
                          <div className="flex justify-between items-start mb-3">
                             <div className="text-xs text-indigo-400 flex items-center font-medium">
                                <SafeIcon icon={FiCalendar} size={12} className="mr-2" /> {new Date(mem.summary_date).toLocaleDateString()}
                             </div>
                             <span className="text-xs font-bold text-indigo-500 bg-indigo-900/30 px-2 py-1 rounded">Score: {(mem.similarity * 100).toFixed(1)}%</span>
                          </div>
                          <p className="text-sm text-slate-200 leading-relaxed mb-4">{mem.executive_summary}</p>
                          {mem.key_decisions && mem.key_decisions.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Key Decisions</h4>
                              <div className="flex flex-wrap gap-2">
                                {mem.key_decisions.map((dec, dIdx) => (
                                  <span key={dIdx} className="text-xs bg-onyx-800 text-slate-300 px-2 py-1 rounded-full border border-onyx-accent/20">
                                    {dec}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Granular Chat Context */}
                {results.chat_context?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-3 border-b border-onyx-accent/20 pb-2">Interaction Recall</h3>
                    <div className="space-y-3">
                      {results.chat_context.map((chat, idx) => (
                        <div key={`chat-${idx}`} className="p-4 bg-onyx-900/50 rounded-lg border border-onyx-accent/10">
                           <div className="flex justify-between items-start mb-2">
                             <div className="text-xs text-slate-400 flex items-center">
                                <SafeIcon icon={FiMessageSquare} size={12} className="mr-2" /> <span className="font-medium text-slate-400">Match Score: {(chat.similarity * 100).toFixed(1)}%</span>
                             </div>
                          </div>
                          <div className="mb-2">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prompt:</span>
                            <p className="text-sm text-slate-300 mt-1">{chat.command}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Response:</span>
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{chat.response}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </motion.div>
            ) : (
              !isSearching && query && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
                    No matching deep memories found in the bank.
                 </motion.div>
              )
            )}
          </AnimatePresence>
        ) : (
          // Default Feed View
          <div>
            <h3 className="text-lg font-semibold text-slate-300 mb-4">Recent Strategic Summaries</h3>
            {loadingFeed ? (
              <div className="flex justify-center p-8"><SafeIcon icon={FiLoader} className="animate-spin text-indigo-500 text-2xl" /></div>
            ) : feed.length > 0 ? (
              <div className="space-y-4">
                {feed.map((item) => (
                  <div key={item.id} className="p-5 bg-onyx-900/40 rounded-lg border border-onyx-accent/20 hover:border-indigo-500/30 transition-colors">
                    <div className="flex items-center text-xs text-indigo-400 font-medium mb-3">
                      <SafeIcon icon={FiCalendar} size={14} className="mr-2" />
                      {new Date(item.summary_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <p className="text-sm text-slate-200 mb-4">{item.executive_summary}</p>
                    {item.key_decisions && item.key_decisions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.key_decisions.map((dec, idx) => (
                          <span key={idx} className="text-xs bg-onyx-800 text-slate-300 px-2 py-1 rounded-md border border-onyx-accent/10">
                            • {dec}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
               <div className="text-center p-8 text-slate-500 bg-onyx-900/20 rounded-lg border border-onyx-accent/10">
                  No memory banks compiled yet. The cognitive compressor runs nightly.
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryBank;
