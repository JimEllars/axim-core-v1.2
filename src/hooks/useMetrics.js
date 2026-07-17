// src/hooks/useMetrics.js
import { useApi } from './useApi';
import { useDashboard } from '../contexts/DashboardContext';
import config from '../config';
import api from '../services/onyxAI/api';

const mockMetrics = {
  totalContacts: 1337,
  newToday: 42,
  activeEvents: 8,
  aiInteractions: 256,
  contactChange: 3.2,
  workflowsTriggered: 12,
  activeUsers: 7,
  totalGenerations: 420,
  cacheSavings: 35.5,
  microAppMetrics: [
    { app_id: 'nda_generator', total_requests: 120, avg_execution_time_ms: 450, avg_compute_ms: 300, total_tokens: 15000, error_count: 2 },
    { app_id: 'demand_letter', total_requests: 85, avg_execution_time_ms: 600, avg_compute_ms: 400, total_tokens: 22000, error_count: 0 }
  ],
};

export const useMetrics = () => {
  const { refreshKey } = useDashboard();
  const apiCall = config.isMockLlmEnabled
    ? async () => mockMetrics
    : () => api.getDashboardMetrics();

  // useApi will automatically refetch when its dependency array (the second argument) changes.
  // Since refreshKey is in the dependency array, the redundant useEffect is not needed.
  const { data: metrics, loading, error, refetch } = useApi(apiCall, [refreshKey], { cache: true });

  return { metrics, loading, error, refetch };
};
