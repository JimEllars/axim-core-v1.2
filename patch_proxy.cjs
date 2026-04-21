const fs = require('fs');

const file = 'src/services/apiProxy.js';
let content = fs.readFileSync(file, 'utf8');

const newContent = `import { supabase } from './supabaseClient'; // Assuming you have a supabase client export
import { callCloudApi } from './apiClient';
import logger from './logging';

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

  try {
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
      // 500, 502, 503, etc are surfaced through error object
      throw error;
    }

    if (data && data.error) {
      // Logic errors passed from backend
      throw new Error(\`API Error: \${data.error}\`);
    }

    return data;
  } catch (error) {
    const isServerError = error.status >= 500 || error.message.includes('timeout') || error.message.includes('fetch');

    // Only failover on true server/network issues, not 4xx client errors
    if (isServerError || !error.status) {
       logger.warn(\`API Proxy Error (Supabase Edge): \${error.message}. Failing over to GCP backend.\`);

       try {
          // Attempt GCP failover
          const gcpData = await callCloudApi('api-proxy-fallback', {
              integrationId,
              endpoint,
              method,
              body,
              headers
          });

          logger.info(\`GCP Fallback successful for \${endpoint}\`);
          return gcpData;
       } catch (gcpError) {
          logger.error(\`GCP Fallback failed for \${endpoint}\`, gcpError);
          throw new Error(\`API Proxy Error (Dual-Backend Failure): \${error.message} | GCP: \${gcpError.message || gcpError.error}\`);
       }
    }

    // If it's a 4xx error or an explicitly returned logic error, don't failover
    throw new Error(\`API Proxy Error: \${error.message}\`);
  }
};
`;

fs.writeFileSync(file, newContent, 'utf8');
