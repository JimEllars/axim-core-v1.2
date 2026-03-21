import React, { useState } from 'react';
import { useVectorSearch } from '../../hooks/useVectorSearch';
import { useSupabase } from '../../contexts/SupabaseContext';
import SafeIcon from '../../common/SafeIcon';
import { FiSearch, FiMessageSquare, FiCalendar, FiLoader } from 'react-icons/fi';
import toast from 'react-hot-toast';

const MemoryBank = () => {
  const [query, setQuery] = useState('');
  const { searchMemory, isSearching, results, error } = useVectorSearch();
  const { user } = useSupabase();

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
    <div className="bg-onyx-950 rounded-lg p-6 border border-onyx-accent/20 w-full">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white flex items-center">
          <SafeIcon icon={FiSearch} className="mr-2 text-indigo-400" />
          Memory Bank Search (RAG)
        </h2>
        <p className="text-sm text-slate-400">Search past AI interactions semantically.</p>
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., 'What did we discuss about the billing module last week?'"
            className="w-full bg-onyx-950 border border-onyx-accent/20 rounded-lg px-4 py-3 pl-10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <SafeIcon icon={FiSearch} className="absolute left-3 top-3.5 text-slate-500" />
          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-2 top-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-md text-sm transition-colors disabled:opacity-50"
          >
            {isSearching ? <SafeIcon icon={FiLoader} className="animate-spin" /> : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 mb-4 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {results && results.length > 0 ? (
          results.map((result, idx) => (
            <div key={idx} className="p-4 bg-onyx-950/50 rounded-lg border border-onyx-accent/20">
              <div className="flex justify-between items-start mb-2">
                 <div className="text-xs text-slate-400 flex items-center">
                    <SafeIcon icon={FiMessageSquare} size={12} className="mr-1" /> Match Score: {(result.similarity * 100).toFixed(1)}%
                 </div>
              </div>
              <div className="mb-2">
                <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">User Prompt:</span>
                <p className="text-sm text-slate-300 mt-1">{result.command}</p>
              </div>
              <div>
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">AI Response:</span>
                <p className="text-sm text-slate-300 mt-1 line-clamp-3">{result.response}</p>
              </div>
            </div>
          ))
        ) : (
          !isSearching && query && (
             <div className="text-center p-8 text-slate-500 border border-dashed border-onyx-accent/20 rounded-lg">
                No matching memory logs found.
             </div>
          )
        )}
      </div>
    </div>
  );
};

export default MemoryBank;
