import axios from 'axios';
import logger from './logging';
import toast from 'react-hot-toast';
import { supabase } from './supabaseClient'; // Ensure supabase client is available

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

apiClient.interceptors.request.use(async (config) => {
  let token = localStorage.getItem('supabase.auth.token');
  if (token) {
    try {
      const parsedToken = JSON.parse(token);
      token = parsedToken?.access_token || token;
    } catch (e) {
      // ignore parse error if token is just a string
    }
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['x-axim-correlation-id'] = logger.getCorrelationId();
  return config;
}, (error) => {
  return Promise.reject(error);
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response) {
      if (error.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        try {
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !data.session) {
             throw new Error('Session refresh failed');
          }
          const newToken = data.session.access_token;
          localStorage.setItem('supabase.auth.token', JSON.stringify(data.session));
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch (refreshErr) {
          localStorage.removeItem('supabase.auth.token');
          localStorage.removeItem('axim_session_token');
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          window.location.href = '/#/login';
          return Promise.reject(error);
        }
      } else if (error.response.status === 403) {
         // Dispatch to telemetry ingress
         logger.captureException(new PermissionError(`RLS Block / 403 Forbidden on ${error.response.config?.url}`), {
             url: error.response.config?.url,
             status: 403
         });
         throw new PermissionError(`Permission Denied: Access to cross-tenant data or unauthorized resource.`);
      } else if (error.response.status >= 500) {
        return Promise.reject({ error: true, message: "Gateway unavailable" });
      } else if (error.response.status === 401) {
          localStorage.removeItem('supabase.auth.token');
          localStorage.removeItem('axim_session_token');
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          window.location.href = '/#/login';
      }
    } else if (error.request) {
      return Promise.reject({ error: true, message: "Gateway unavailable" });
    }
    return Promise.reject(error);
  }
);

export const callCloudApi = async (endpoint, payload) => {
  try {
    const response = await apiClient.post(`/${endpoint}`, payload);
    return response.data;
  } catch (error) {
    logger.error(`Cloud API call to '${endpoint}' failed:`, error);
    if (error instanceof PermissionError) throw error;
    throw {
      success: false,
      error: error.response?.data?.error || error.message || 'A network error occurred.',
      source: `apiClient:${endpoint}`,
      correlationId: logger.getCorrelationId()
    };
  }
};

export default apiClient;
