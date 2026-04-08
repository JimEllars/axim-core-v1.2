import { useEffect } from 'react';
import toast from 'react-hot-toast';
import config from '../config';
import logger from '../services/logging';

// Simple module-level cache to prevent redundant expensive RPC calls
let cachedStats = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000; // 30 seconds TTL

export const useSystemStats = (supabase, dispatch) => {
  const fetchSystemStats = async () => {
    if (!supabase) return;

    const now = Date.now();
    // Return cached data if within TTL, but still update live connections
    if (cachedStats && (now - lastFetchTime < CACHE_TTL)) {
      dispatch({
        type: 'SET_SYSTEM_STATS',
        payload: {
          ...cachedStats,
          activeConnections: supabase.getChannels().length
        }
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_api_call_summary');
      if (error) throw error;
      if (data && data.length > 0) {
        const summary = data[0];
        const newStats = {
          totalApiCalls: summary.total_calls || 0,
          apiSuccessRate: summary.success_rate || 100,
        };

        cachedStats = newStats;
        lastFetchTime = now;

        dispatch({
          type: 'SET_SYSTEM_STATS',
          payload: {
            ...newStats,
            activeConnections: supabase.getChannels().length
          }
        });
      }
    } catch (error) {
      logger.error("Error fetching system stats:", error);
      toast.error("Failed to fetch system stats.");
    }
  };

  useEffect(() => {
    if (!supabase || config.isMockLlmEnabled) return;
    fetchSystemStats();
    const interval = setInterval(fetchSystemStats, 15000); // Refresh stats every 15 seconds
    return () => clearInterval(interval);
  }, [supabase, dispatch]);
};
