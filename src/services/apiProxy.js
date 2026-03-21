import { supabase } from './supabaseClient'; // Assuming you have a supabase client export

/**
 * Calls the secure API proxy edge function.
 * @param {string} integrationId - The ID of the API integration to use.
 * @param {string} endpoint - The API endpoint to call (e.g., '/users').
 * @param {string} method - The HTTP method (e.g., 'GET', 'POST').
 * @param {object} [body] - The request body for POST/PUT requests.
 * @param {object} [headers] - Additional headers for the request.
 * @returns {Promise<any>} - The response data from the API.
 */
export const callApiProxy = async ({ integrationId, endpoint, method, body, headers }) => {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const { data, error } = await supabase.functions.invoke('api-proxy', {
    body: {
      integrationId,
      endpoint,
      method,
      body,
      headers,
    },
  });

  if (error) {
    throw new Error(`API Proxy Error: ${error.message}`);
  }

  if (data.error) {
    throw new Error(`API Error: ${data.error}`);
  }

  return data;
};