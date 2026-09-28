import { logTelemetry } from '../telemetry';

const TOOL_CACHE = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;

export class MCPClientError extends Error {
  constructor(message, code, data) {
    super(message);
    this.name = 'MCPClientError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Creates an AbortController with a timeout
 */
const createTimeout = (ms) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { controller, timeoutId };
};

/**
 * Performs a JSON-RPC fetch request with timeout and retries
 */
const fetchRpc = async (url, token, method, params, id = 1, retries = 3) => {
  let attempt = 0;

  while (attempt < retries) {
    const { controller, timeoutId } = createTimeout(DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if ([502, 503, 504].includes(response.status) && attempt < retries - 1) {
          attempt++;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw new MCPClientError(`HTTP Error ${response.status}`, response.status);
      }

      const data = await response.json();

      if (data.error) {
        throw new MCPClientError(data.error.message, data.error.code, data.error.data);
      }

      return data.result;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new MCPClientError(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`, -32000);
      }

      if (attempt >= retries - 1) {
        throw error;
      }

      attempt++;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

export const listTools = async (serverUrl, authToken) => {
  const cacheKey = `${serverUrl}_${authToken}`;
  const cached = TOOL_CACHE.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.tools;
  }

  const result = await fetchRpc(serverUrl, authToken, 'tools/list', {});

  TOOL_CACHE.set(cacheKey, {
    timestamp: Date.now(),
    tools: result.tools || []
  });

  return result.tools || [];
};

export const callTool = async (serverUrl, authToken, toolName, argumentsObj) => {
  try {
    const result = await fetchRpc(serverUrl, authToken, 'tools/call', {
      name: toolName,
      arguments: argumentsObj
    }, 2);

    logTelemetry({
      type: 'mcp_tool_call',
      status: 'success',
      endpoint: serverUrl,
      app_id: toolName,
      execution_time_ms: 0
    });

    return result;
  } catch (error) {
    logTelemetry({
      type: 'mcp_tool_call',
      status: 'error',
      endpoint: serverUrl,
      app_id: toolName,
      error_message: error.message
    });

    throw error;
  }
};
