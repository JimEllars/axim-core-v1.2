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
    : async () => {
        const [dashboardMetrics, rawMicroAppMetrics] = await Promise.all([
          api.getDashboardMetrics(),
          api.getMicroAppMetrics()
        ]);

        // Segment inbound telemetry array states dynamically
        const segmented = (rawMicroAppMetrics || []).reduce((acc, log) => {
          const appId = log.app_id || 'unknown';
          if (!acc[appId]) {
            acc[appId] = {
              app_id: appId,
              total_requests: 0,
              total_execution_time: 0,
              total_compute: 0,
              total_tokens: 0,
              error_count: 0
            };
          }
          acc[appId].total_requests += 1;
          acc[appId].total_execution_time += (log.execution_time_ms || 0);
          acc[appId].total_compute += (log.compute_ms || 0);
          acc[appId].total_tokens += (log.total_tokens || log.tokens || 0);
          if (log.status_code >= 400 || log.error || log.error_count) {
            acc[appId].error_count += (log.error_count || 1);
          }
          return acc;
        }, {});

        const microAppMetrics = Object.values(segmented).map(app => ({
          ...app,
          avg_execution_time_ms: app.total_requests > 0 ? Math.round(app.total_execution_time / app.total_requests) : 0,
          avg_compute_ms: app.total_requests > 0 ? Math.round(app.total_compute / app.total_requests) : 0,
        }));

        return {
          ...dashboardMetrics,
          microAppMetrics: microAppMetrics.length > 0 ? microAppMetrics : dashboardMetrics.microAppMetrics || []
        };
      };

  const { data: metrics, loading, error, refetch } = useApi(apiCall, [refreshKey], { cache: true });

  return { metrics, loading, error, refetch };
};
