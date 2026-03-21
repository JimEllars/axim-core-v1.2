import { useEffect } from 'react';
import toast from 'react-hot-toast';
import config from '../config';
import logger from '../services/logging';

export const useSystemStats = (supabase, dispatch) => {
  const fetchSystemStats = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('get_api_call_summary');
      if (error) throw error;
      if (data && data.length > 0) {
        const summary = data[0];
        dispatch({
          type: 'UPDATE_SYSTEM_STATS',
          payload: {
            totalApiCalls: summary.total_calls || 0,
            apiSuccessRate: summary.success_rate || 100,
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
