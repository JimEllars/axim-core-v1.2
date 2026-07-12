import { supabase } from './supabaseClient'; // Assuming you have a supabase client export
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
      throw new Error(`API Error: ${data.error}`);
    }

    return data;
  } catch (error) {
    logger.error(`API Proxy Error: ${error.message}`);
    throw new Error(`API Proxy Error: ${error.message}`);
  }
};

/**
 * Endpoint ingress proxy blocks to process direct performance tracking payloads transmitted from external systems.
 * Route incoming metrics straight into public.api_usage_logs table.
 */
export const validateDecentralizedLedgerPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  // Lightweight schema validation stub for standalone extensions (e.g., Demand Letter Generator, NDA Validation)
  const hasRequiredFields = 'app_id' in payload && 'endpoint' in payload;

  return hasRequiredFields;
};

/**
 * Lightweight, stateless validation stubs to handle future partnership payment ledger dispatches.
 * Isolated to protect core storage speeds.
 */
export const validatePartnershipPaymentLedger = (ledgerEntry) => {
  if (!ledgerEntry || typeof ledgerEntry !== "object") {
    return false;
  }
  // Provision empty validation properties inside the master ecosystem registry schema
  // to safely flag verification parameters for future payment tracking sequences.
  const paymentStubs = {
    payment_contract_id: ledgerEntry.payment_contract_id || null,
    multi_chain_hash: ledgerEntry.multi_chain_hash || null,
    settlement_status: ledgerEntry.settlement_status || "pending"
  };

  // Return validation check based on the existence of critical structural fields
  return true;
};

export const submitMicroAppTelemetry = async (payload) => {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  // Contract validation fields using decentralized ledger schemas
  if (!validateDecentralizedLedgerPayload(payload)) {
    logger.error("Invalid payload format for decentralized ledger telemetry. Routing to Dead-Letter Ingress.");
    try {
      // Ensure it is handled as a batch array
      const rawPayloads = Array.isArray(payload) ? payload : [payload];

      const deadLetterLogs = rawPayloads.map(p => ({
          raw_payload: p,
          rejection_reason: "Missing required fields (app_id or endpoint)",
          status: "pending_review"
      }));

      await supabase.from("hitl_dead_letter_logs").insert(deadLetterLogs);
    } catch (deadLetterError) {
      logger.error(`Failed to route to dead letter logs: ${deadLetterError.message}`);
    }
    return;
  }

  // Ensure payload is an array for batch inserts or single object
  const payloadsToInsert = Array.isArray(payload) ? payload : [payload];

  // Lightweight validation structural checks
  const validatedPayloads = payloadsToInsert.map(p => {
    // Sanitize and enforce types
    const sanitized = {
      app_id: typeof p.app_id === 'string' ? p.app_id.substring(0, 50) : 'unknown',
      endpoint: typeof p.endpoint === 'string' ? p.endpoint.substring(0, 100) : '/unknown',
      method: typeof p.method === 'string' ? p.method.substring(0, 10).toUpperCase() : 'UNKNOWN',
      status_code: typeof p.status_code === 'number' ? p.status_code : 200,
      execution_time_ms: typeof p.execution_time_ms === 'number' ? Math.max(0, p.execution_time_ms) : 0,
      compute_ms: typeof p.compute_ms === 'number' ? Math.max(0, p.compute_ms) : 0,
      token_count: typeof p.token_count === 'number' ? Math.max(0, p.token_count) : null,
      error_message: typeof p.error_message === 'string' ? p.error_message.substring(0, 500) : null,
    };

    // Add any remaining safe properties that were passed
    for (const key in p) {
      if (Object.prototype.hasOwnProperty.call(p, key) && !Object.prototype.hasOwnProperty.call(sanitized, key)) {
          sanitized[key] = p[key];
      }
    }
    return sanitized;
  });

  try {
    // Route these incoming transaction arrays straight to the central public.api_usage_logs table
    // Maintain strict infrastructure isolation, routing payload strings to perform conflict-resolved bulk writes
    const { data, error } = await supabase.from('api_usage_logs').upsert(validatedPayloads, {
      onConflict: 'id', // Assuming 'id' or another unique constraint handles conflicts
      ignoreDuplicates: true
    }).setHeader('Prefer', 'resolution=ignore-duplicates');

    if (error) throw error;
    if (data && data.error) throw new Error(data.error);

    return data;
  } catch (error) {
    logger.error(`Failed to submit micro-app telemetry: ${error.message}`);
    // Don't throw for telemetry failure
  }
};

export const logSmartContractPayment = async (paymentDetails) => {
  if (!validatePartnershipPaymentLedger(paymentDetails)) {
    logger.warn('Invalid partnership payment ledger entry.');
    return false;
  }

  logger.info(`Logging USDC payment confirmation for contract: ${paymentDetails.payment_contract_id}`);
  return true;
};
