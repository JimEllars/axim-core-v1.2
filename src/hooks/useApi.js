// src/hooks/useApi.js
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

const cache = new Map();

/**
 * A generic hook for fetching data from an API.
 *
 * @param {Function} apiCall - The function that makes the API call.
 * @param {Array} dependencies - The dependencies for the `useEffect` hook.
 * @param {Object} options - Options for the hook.
 * @param {boolean} options.cache - Whether to cache the response.
 * @returns {Object} - The state of the API call.
 */
export const useApi = (apiCall, dependencies = [], options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const cacheKey = JSON.stringify({ apiCall: apiCall.toString(), dependencies });

    if (options.cache && cache.has(cacheKey)) {
      setData(cache.get(cacheKey));
      setLoading(false);
      return;
    }

    try {
      const response = await apiCall();
      if (options.cache) {
        cache.set(cacheKey, response);
      }
      setData(response);
    } catch (err) {
      setError(err);
      toast.error('Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};
