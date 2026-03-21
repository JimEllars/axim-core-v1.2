import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabaseClient';
import { useDashboard } from '../contexts/DashboardContext';
/**
 * A custom hook for fetching data from a Supabase RPC function.
 * @param {string} rpcName The name of the Supabase RPC function to call.
 * @param {object} [options] Options for the query.
 * @param {boolean} [options.autoFetch=true] Whether to fetch the data automatically on mount.
 * @returns {{data: any[], loading: boolean, error: Error|null, refetch: () => Promise<void>}}
 */
export const useSupabaseQuery = (rpcName, { autoFetch = true } = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const { refreshKey } = useDashboard();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc(rpcName);
      if (error) throw error;
      setData(data);
    } catch (error) {
      toast.error(`Error fetching data from ${rpcName}`);
      console.error(`Error fetching data from ${rpcName}:`, error);
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [rpcName]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [fetchData, autoFetch, refreshKey]);

  return { data, loading, error, refetch: fetchData };
};
