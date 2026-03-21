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
