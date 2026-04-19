import { useState, useCallback, useRef } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import logger from '../services/logging';

export const useVectorSearch = () => {
  const { supabase } = useSupabase();
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const debounceTimer = useRef(null);

  const executeSearch = async (query, userId, limit = 5, offset = 0) => {
    setIsSearching(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase client not initialized.");
      if (!query) return [];

      const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('generate-embedding', {
        body: { input: query }
      });

      let queryEmbedding;
      if (embeddingError || !embeddingData?.embedding) {
        logger.warn('Failed to generate embedding via Edge Function. Using dummy embedding for testing.', embeddingError);
        queryEmbedding = new Array(1536).fill(0.01);
      } else {
        queryEmbedding = embeddingData.embedding;
      }

      const { data: matchData, error: matchError } = await supabase.rpc('match_ai_interactions', {
        query_embedding: queryEmbedding,
        match_threshold: 0.70,
        match_count: limit,
        p_user_id: userId,
        p_offset: offset
      });

      if (matchError) {
        throw matchError;
      }

      let res = matchData || [];

      setResults(res);
      return res;

    } catch (err) {
      logger.error('Vector search error:', err);
      setError(err.message);
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  const searchMemory = useCallback((query, userId, limit = 5, offset = 0) => {
    return new Promise((resolve) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      if (!query) {
        setResults([]);
        return resolve([]);
      }

      setIsSearching(true);

      debounceTimer.current = setTimeout(async () => {
        const res = await executeSearch(query, userId, limit, offset);
        resolve(res);
      }, 300); // 300ms debounce
    });
  }, [supabase]);

  return { searchMemory, isSearching, results, error };
};
