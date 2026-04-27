import { useState, useCallback, useRef } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import logger from '../services/logging';

export const useVectorSearch = () => {
  const { supabase } = useSupabase();
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const debounceTimer = useRef(null);

  const executeSearch = async (query, userId, limit = 5) => {
    setIsSearching(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase client not initialized.");
      if (!query) return null;

      const { data, error: functionError } = await supabase.functions.invoke('memory-retrieval', {
        body: { query, user_id: userId, limit },
        headers: {
            'X-Axim-Internal-Service-Key': import.meta.env.VITE_ONYX_SECURE_KEY || 'test_internal_key'
        }
      });

      if (functionError) {
        throw functionError;
      }

      setResults(data);
      return data;

    } catch (err) {
      logger.error('Vector search error:', err);
      setError(err.message);
      setResults(null);
      return null;
    } finally {
      setIsSearching(false);
    }
  };

  const searchMemory = useCallback((query, userId, limit = 5) => {
    return new Promise((resolve) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      if (!query) {
        setResults(null);
        return resolve(null);
      }

      setIsSearching(true);

      debounceTimer.current = setTimeout(async () => {
        const res = await executeSearch(query, userId, limit);
        resolve(res);
      }, 300); // 300ms debounce
    });
  }, [supabase]);

  return { searchMemory, isSearching, results, error };
};
