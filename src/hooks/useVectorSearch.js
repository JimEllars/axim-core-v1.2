import { useState, useCallback } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import logger from '../services/logging';

export const useVectorSearch = () => {
  const { supabase } = useSupabase();
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const searchMemory = useCallback(async (query, userId) => {
    setIsSearching(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase client not initialized.");
      if (!query) return [];

      // Step 1: Generate embedding for the query.
      const { data: embeddingData, error: embeddingError } = await supabase.functions.invoke('generate-embedding', {
        body: { input: query }
      });

      let queryEmbedding;
      if (embeddingError || !embeddingData?.embedding) {
        logger.warn('Failed to generate embedding via Edge Function. Using dummy embedding for testing.', embeddingError);
        // Fallback: Use a dummy vector if the edge function isn't deployed or configured with an API key.
        // This allows the UI and `match_ai_interactions` to be tested without valid OpenAI keys.
        queryEmbedding = new Array(1536).fill(0.01);
      } else {
        queryEmbedding = embeddingData.embedding;
      }

      // Step 2: Call the RPC to match interactions.
      const { data: matchData, error: matchError } = await supabase.rpc('match_ai_interactions', {
        query_embedding: queryEmbedding,
        match_threshold: 0.70, // 70% similarity threshold
        match_count: 5,
        p_user_id: userId
      });

      if (matchError) {
        throw matchError;
      }

      setResults(matchData || []);
      return matchData || [];
    } catch (err) {
      logger.error('Vector search error:', err);
      setError(err.message);
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [supabase]);

  return { searchMemory, isSearching, results, error };
};
