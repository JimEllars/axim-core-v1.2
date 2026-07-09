import { useState, useCallback, useRef } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import logger from '../services/logging';
import { useAuth } from '../contexts/AuthContext';

export const useVectorSearch = () => {
  const { supabase, session } = useSupabase();
  const { user } = useAuth();
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [confidenceMetric, setConfidenceMetric] = useState(null);
  const debounceTimer = useRef(null);

  const executeSearch = async (query, userId, limit = 5) => {
    setIsSearching(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Supabase client not initialized.");
      if (!query) return null;

      const workerUrl = import.meta.env.VITE_ONYX_WORKER_URL;
      let data, functionError;

      if (workerUrl) {
         // Query serverless lookup endpoint natively
         const response = await fetch(`${workerUrl}/api/v1/search`, {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${session?.access_token || user?.token}`
             },
             body: JSON.stringify({ query, user_id: userId, limit })
         });

         if (!response.ok) {
             functionError = new Error(`Vector search API error: ${response.statusText}`);
         } else {
             data = await response.json();
         }
      } else {
         const response = await supabase.functions.invoke('memory-retrieval', {
           body: { query, user_id: userId, limit },
           headers: {
               'X-Axim-Internal-Service-Key': import.meta.env.VITE_ONYX_SECURE_KEY || 'test_internal_key'
           }
         });
         data = response.data;
         functionError = response.error;
      }

      if (functionError) {
        throw functionError;
      }

      setResults(data);

      // Calculate Vector Match Confidence if possible (this is just the mathematical formulation tracker request)
      // "Vector Match Confidence = (A . B) / (||A|| ||B||)"
      // Usually the similarity returned from backend is already cosine similarity.
      if (data && data.length > 0 && data[0].similarity !== undefined) {
         setConfidenceMetric(data[0].similarity);
      }

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
        setConfidenceMetric(null);
        return resolve(null);
      }

      setIsSearching(true);

      debounceTimer.current = setTimeout(async () => {
        const res = await executeSearch(query, userId, limit);
        resolve(res);
      }, 300); // 300ms debounce
    });
  }, [supabase, session, user]);

  return { searchMemory, isSearching, results, error, confidenceMetric };
};
