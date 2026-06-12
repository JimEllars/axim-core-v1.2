import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import logger from '../services/logging';
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

      // RLS Check: If 0 rows are returned but we expect data, it could be an RLS block
      // We will log a warning and dispatch a telemetry event
      if (Array.isArray(data) && data.length === 0) {
        logger.captureException(new Error(`Zero rows returned from ${rpcName} - Potential RLS/Token issue`), {
            rpcName,
            status: '0 rows returned'
        });
        toast.error(`No data returned from ${rpcName}. Check permissions.`, { id: 'rls-warning' });
      }

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
