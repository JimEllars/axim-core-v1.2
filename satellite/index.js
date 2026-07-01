// AXiM Satellite SDK (Node.js)
// This module implements the AXiM Satellite Protocol for connecting lightweight apps to the Core API.

class AXiMHandshake {
  /**
   * @param {string} appId - The unique ID of this Satellite App.
   * @param {string} appSecret - The secret key for authentication.
   * @param {string} coreUrl - The base URL of the AXiM Core API (e.g., http://localhost:8080 or https://api.aximsystems.com).
   */
  constructor(appId, appSecret, coreUrl) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.coreUrl = coreUrl.replace(/\/$/, ''); // Remove trailing slash
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Performs the handshake with AXiM Core to obtain a session token.
   * Must be called before emitting pulses.
   */
  async connect() {
    try {
      console.log(`[AXiM Satellite] Connecting to Core at ${this.coreUrl}...`);
      const response = await fetch(`${this.coreUrl}/v1/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Handshake failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      this.token = data.token;
      // Optional: Store expiry to handle refreshing automatically
      console.log(`[AXiM Satellite] Handshake successful. Token received.`);
      return true;
    } catch (error) {
      console.error('[AXiM Satellite] Handshake Error:', error);
      throw error;
    }
  }

  /**
   * Emits a pulse (telemetry/event) to the AXiM Core.
   * This is a non-blocking operation (fire-and-forget).
   *
   * @param {string} eventType - The type of event (e.g., 'document.created', 'error.log').
   * @param {Object} data - App-specific data payload.
   * @param {Object} telemetry - structured telemetry (latency, status, etc.).
   * @param {string} [userId] - Optional ID of the user triggering the event.
   */
  emit_pulse(eventType, data = {}, telemetry = {}, userId = null) {
    if (!this.token) {
      console.warn('[AXiM Satellite] Pulse skipped: Not connected (No Token). Call connect() first.');
      return;
    }

    const payload = {
      source: this.appId,
      event: eventType,
      user_id: userId,
      data: data,
      telemetry: {
        ...telemetry,
        timestamp: new Date().toISOString()
      }
    };

    // Fire and forget (don't await)
    // We catch errors to prevent unhandled promise rejections crashing the process
    fetch(`${this.coreUrl}/v1/pulse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) {
            console.warn(`[AXiM Satellite] Pulse rejected by Core: ${res.status}`);
        }
    })
    .catch(err => {
      console.error('[AXiM Satellite] Pulse transmission failed:', err.message);
    });
  }

  /**
   * Dispatches an error envelope directly formatted for public.telemetry_events.
   *
   * @param {string} message - Human readable error message
   * @param {string} severity - DEBUG, INFO, WARN, ERROR, FATAL
   * @param {string} errorCode - Specific error code
   * @param {Object} payload - Context object, stack traces, request state
   * @param {string} idempotencyKey - Prevents duplicate retry storms
   */
  emit_error_envelope(message, severity = 'ERROR', errorCode = null, payload = {}, idempotencyKey = null) {
    if (!this.token) {
      console.warn('[AXiM Satellite] Error envelope skipped: Not connected (No Token). Call connect() first.');
      return;
    }

    const errorPayload = {
      component_id: this.appId,
      environment: process.env.NODE_ENV || 'production',
      severity,
      error_code: errorCode,
      message,
      payload,
      idempotency_key: idempotencyKey || crypto.randomUUID()
    };

    // Assuming we use an ingest endpoint for telemetry events directly or map it via telemetry/ingest
    fetch(`${this.coreUrl}/v1/telemetry/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify(errorPayload)
    })
    .then(res => {
        if (!res.ok) {
            console.warn(`[AXiM Satellite] Error envelope rejected by Core: ${res.status}`);
        }
    })
    .catch(err => {
      console.error('[AXiM Satellite] Error envelope transmission failed:', err.message);
    });
  }

  /**
   * Pings the health endpoint to assert node liveliness
   */
  async ping_health() {
    try {
      const response = await fetch(`${this.coreUrl}/v1/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component_id: this.appId })
      });

      if (!response.ok) {
         console.warn(`[AXiM Satellite] Health ping rejected: ${response.status}`);
         return false;
      }
      return true;
    } catch (error) {
      console.error('[AXiM Satellite] Health ping failed:', error.message);
      return false;
    }
  }
}

module.exports = { AXiMHandshake };
