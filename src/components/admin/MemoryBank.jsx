import React, { useState, useEffect } from 'react';
import { useVectorSearch } from '../../hooks/useVectorSearch';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiSearch, FiMessageSquare, FiCalendar, FiLoader, FiZap, FiEdit2, FiTrash2, FiSave, FiX, FiFilter } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const MemoryBank = () => {
  const [query, setQuery] = useState('');
  const { searchMemory, isSearching, results, error } = useVectorSearch();
  const { user, supabase } = useSupabase();
  const [feed, setFeed] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [activeTab, setActiveTab] = useState('memory_banks');
  const [sourceFilter, setSourceFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
   // 'memory_banks' or 'executive_knowledge_base'

  useEffect(() => {
    const fetchRecentMemories = async () => {
      if (!supabase) return;
      setLoadingFeed(true);
      try {
        if (activeTab === 'ai_memory_banks') {
          let q = supabase
            .from('ai_memory_banks')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

          if (sourceFilter) q = q.eq('source_type', sourceFilter);
          if (partnerFilter) q = q.contains('metadata', { partner: partnerFilter });

          const { data, error } = await q;
          if (error) throw error;
          setFeed(data || []);
        } else if (activeTab === 'memory_banks') {
          const { data, error } = await supabase
            .from('memory_banks')
            .select('*')
            .order('summary_date', { ascending: false })
            .limit(10);
          if (error) throw error;
          setFeed(data || []);
        } else {
          const { data, error } = await supabase
            .from('executive_knowledge_base')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
          if (error) throw error;
          setFeed(data || []);
        }
      } catch (err) {
        toast.error('Failed to load recent memories.');
      } finally {
        setLoadingFeed(false);
      }
    };
    if (!query) {
      fetchRecentMemories();
    }
  }, [supabase, query, activeTab, sourceFilter, partnerFilter]);

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

  const handleDelete = async (id, table) => {
    if (!window.confirm('Are you sure you want to delete this memory?')) return;

    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Memory deleted successfully');
      if (query) {
        handleSearch({ preventDefault: () => {} });
      } else {
        setFeed(feed.filter(item => item.id !== id));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete memory');
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditContent(item.executive_summary || item.content || item.response);
  };

  const handlePrune = async (id, table) => {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      toast.success('Record pruned successfully.');
      setFeed(feed.filter(item => item.id !== id));
    } catch (e) {
      toast.error('Failed to prune record: ' + e.message);
    }
  };

  const handleSaveEdit = async (id, table, field) => {
    try {
      // First update the text content
      const { error: updateError } = await supabase
        .from(table)
        .update({ [field]: editContent })
        .eq('id', id);

      if (updateError) throw updateError;

      // Re-vectorize if it's not just a simple log
      if (table !== 'ai_interactions_ax2024') {
        const { error: invokeError } = await supabase.functions.invoke('generate-embedding', {
           body: {
             input: editContent,
             record_id: id,
             table: table,
             field: field
           },
           headers: {
             'X-Axim-Internal-Service-Key': import.meta.env.VITE_ONYX_SECURE_KEY || 'test_internal_key'
           }
        });
        if (invokeError) {
          console.warn('Failed to re-vectorize, but content was saved:', invokeError);
          toast.success('Content updated, but re-vectorization failed.');
        } else {
          toast.success('Memory updated and re-vectorized');
        }
      } else {
        toast.success('Interaction updated');
      }

      setEditingId(null);
      if (query) {
        handleSearch({ preventDefault: () => {} });
      } else {
        // Optimistic update for feed
        setFeed(feed.map(item => item.id === id ? { ...item, [field]: editContent } : item));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update memory');
    }
  };

  const renderMemoryControls = (item, table, field) => {
    if (editingId === item.id) {
      return (
        <div className="flex gap-2">
          <button onClick={() => handleSaveEdit(item.id, table, field)} className="text-green-400 hover:text-green-300 transition-colors" title="Save">
            <SafeIcon icon={FiSave} size={16} />
          </button>
          <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-300 transition-colors" title="Cancel">
            <SafeIcon icon={FiX} size={16} />
          </button>
        </div>
      );
    }
    return (
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => handleEdit(item)} className="text-indigo-400 hover:text-indigo-300 transition-colors" title="Edit">
          <SafeIcon icon={FiEdit2} size={16} />
        </button>
        <button onClick={() => handleDelete(item.id, table)} className="text-red-400 hover:text-red-300 transition-colors" title="Delete">
          <SafeIcon icon={FiTrash2} size={16} />
        </button>
      </div>
    );
  };

  const renderContent = (item, field) => {
    if (editingId === item.id) {
      return (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full bg-onyx-950 border border-indigo-500/50 rounded-md p-3 text-sm text-slate-200 mt-2 min-h-[100px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      );
    }
    return <p className="text-sm text-slate-200 leading-relaxed mb-4">{item[field]}</p>;
  };

  return (
    <div className="bg-onyx-950 rounded-lg p-6 border border-onyx-accent/20 w-full shadow-lg">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <SafeIcon icon={FiZap} className="mr-3 text-indigo-400" />
            Mission Control: Cognitive Memory Bank
          </h2>
          <p className="text-sm text-slate-400 mt-2">Access and query the AI's long-term memory, strategic context, and interaction summaries.</p>
        </div>
        {!query && (
          <div className="flex gap-2 bg-onyx-900 p-1 rounded-lg border border-onyx-accent/20">
            <button
              onClick={() => setActiveTab('memory_banks')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'memory_banks' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Strategic Memory
            </button>
            <button
              onClick={() => setActiveTab('ai_memory_banks')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'ai_memory_banks' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Cognitive Explorer
            </button>
            <button
              onClick={() => setActiveTab('executive_knowledge_base')}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${activeTab === 'executive_knowledge_base' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Knowledge Base
            </button>
          </div>
        )}
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
            {results?.strategic_context?.length > 0 || results?.executive_knowledge_base?.length > 0 || results?.chat_context?.length > 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

                {/* Knowledge Base Results */}
                {results.executive_knowledge_base?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-3 border-b border-indigo-900/50 pb-2">Knowledge Base</h3>
                    <div className="space-y-4">
                      {results.executive_knowledge_base.map((kb, idx) => (
                        <div key={`kb-${idx}`} className="group p-5 bg-onyx-900/80 rounded-lg border border-indigo-500/30 relative">
                          <div className="flex justify-between items-start mb-3">
                             <div className="text-xs text-indigo-400 flex items-center font-medium">
                                <SafeIcon icon={FiCalendar} size={12} className="mr-2" /> {new Date(kb.created_at).toLocaleDateString()}
                             </div>
                             <div className="flex items-center gap-3">
                                {renderMemoryControls(kb, 'executive_knowledge_base', 'content')}
                                <span className="text-xs font-bold text-indigo-500 bg-indigo-900/30 px-2 py-1 rounded">Score: {(kb.similarity * 100).toFixed(1)}%</span>
                             </div>
                          </div>
                          <div className="mb-2">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Category: {kb.category || 'General'}</span>
                          </div>
                          {renderContent(kb, 'content')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strategic Context */}
                {results.strategic_context?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-3 border-b border-indigo-900/50 pb-2">Strategic Memory</h3>
                    <div className="space-y-4">
                      {results.strategic_context.map((mem, idx) => (
                        <div key={`strat-${idx}`} className="group p-5 bg-onyx-900/80 rounded-lg border border-indigo-500/30 relative">
                          <div className="flex justify-between items-start mb-3">
                             <div className="text-xs text-indigo-400 flex items-center font-medium">
                                <SafeIcon icon={FiCalendar} size={12} className="mr-2" /> {new Date(mem.summary_date).toLocaleDateString()}
                             </div>
                             <div className="flex items-center gap-3">
                                {renderMemoryControls(mem, 'memory_banks', 'executive_summary')}
                                <span className="text-xs font-bold text-indigo-500 bg-indigo-900/30 px-2 py-1 rounded">Score: {(mem.similarity * 100).toFixed(1)}%</span>
                             </div>
                          </div>
                          {renderContent(mem, 'executive_summary')}
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
                        <div key={`chat-${idx}`} className="group p-4 bg-onyx-900/50 rounded-lg border border-onyx-accent/10 relative">
                           <div className="flex justify-between items-start mb-2">
                             <div className="text-xs text-slate-400 flex items-center">
                                <SafeIcon icon={FiMessageSquare} size={12} className="mr-2" /> <span className="font-medium text-slate-400">Match Score: {(chat.similarity * 100).toFixed(1)}%</span>
                             </div>
                             {renderMemoryControls(chat, 'ai_interactions_ax2024', 'response')}
                          </div>
                          <div className="mb-2">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prompt:</span>
                            <p className="text-sm text-slate-300 mt-1">{chat.command}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Response:</span>
                            {editingId === chat.id ? renderContent(chat, 'response') : <p className="text-sm text-slate-400 mt-1 line-clamp-2">{chat.response}</p>}
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
            <h3 className="text-lg font-semibold text-slate-300 mb-4">
              {activeTab === 'ai_memory_banks' ? 'Cognitive Explorer' : activeTab === 'memory_banks' ? 'Recent Strategic Summaries' : 'Knowledge Base Entries'}
            </h3>
            {activeTab === 'ai_memory_banks' && (
              <div className="flex space-x-4 mb-4">
                <input
                  type="text"
                  placeholder="Filter by source (e.g. Affiliate Partner, OSINT)"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="bg-onyx-900 border border-onyx-accent/20 rounded-md px-3 py-1.5 text-sm text-white"
                />
                <input
                  type="text"
                  placeholder="Filter by partner (e.g. Powur Solar)"
                  value={partnerFilter}
                  onChange={(e) => setPartnerFilter(e.target.value)}
                  className="bg-onyx-900 border border-onyx-accent/20 rounded-md px-3 py-1.5 text-sm text-white"
                />
              </div>
            )}
            {loadingFeed ? (
              <div className="flex justify-center p-8"><SafeIcon icon={FiLoader} className="animate-spin text-indigo-500 text-2xl" /></div>
            ) : feed.length > 0 ? (
              <div className="space-y-4">
                {feed.map((item) => (
                  <div key={item.id} className="group p-5 bg-onyx-900/40 rounded-lg border border-onyx-accent/20 hover:border-indigo-500/30 transition-colors relative">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center text-xs text-indigo-400 font-medium">
                        <SafeIcon icon={FiCalendar} size={14} className="mr-2" />
                        {new Date(item.summary_date || item.created_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                      {activeTab !== 'ai_memory_banks' && renderMemoryControls(item, activeTab, activeTab === 'memory_banks' ? 'executive_summary' : 'content')}
                    </div>
                    {activeTab === 'ai_memory_banks' && (
                      <div className="mb-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source: {item.source_type}</span>
                        {item.metadata?.partner && <span className="ml-4 text-xs font-semibold text-indigo-400 uppercase tracking-wider">Partner: {item.metadata.partner}</span>}
                        <button onClick={() => handlePrune(item.id, 'ai_memory_banks')} className="ml-4 text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded">Prune</button>
                      </div>
                    )}
                    {activeTab === 'executive_knowledge_base' && (
                      <div className="mb-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Category: {item.category || 'General'}</span>
                      </div>
                    )}
                    {renderContent(item, activeTab === 'memory_banks' ? 'executive_summary' : 'content')}
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
                  {activeTab === 'ai_memory_banks' ? 'No records found.' : activeTab === 'memory_banks' ? 'No memory banks compiled yet. The cognitive compressor runs nightly.' : 'No knowledge base entries found.'}
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemoryBank;
