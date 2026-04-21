import axios from 'axios';
import logger from './logging';

// In a real-world scenario, the VITE_API_BASE_URL would come from the .env file
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add the auth token to requests
// This assumes a token is stored in localStorage or obtained from an auth context
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase.auth.token'); // Example of getting a token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['x-axim-correlation-id'] = logger.getCorrelationId();
  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * A generic handler for making API calls to the cloud backend.
 * This function will be used by the ApiProvider in "cloud" mode.
 * @param {string} endpoint The API endpoint to call (e.g., 'device/list').
 * @param {object} payload The data to send with the request.
 * @returns {Promise<any>} The data from the API response.
 */
export const callCloudApi = async (endpoint, payload) => {
  try {
    // We'll use POST requests to mirror the IPC invoke/handle pattern
    const response = await apiClient.post(`/${endpoint}`, payload);
    return response.data;
  } catch (error) {
    logger.error(`Cloud API call to '${endpoint}' failed:`, error);
    // Re-throw a structured error similar to the IPC handler's format
    throw {
      success: false,
      error: error.response?.data?.error || 'A network error occurred.',
      source: `apiClient:${endpoint}`,
      correlationId: logger.getCorrelationId()
    };
  }
};

export default apiClient;
