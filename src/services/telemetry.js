export const trackEvent = (() => {
  let queue = [];
  let isFlushing = false;
  let consecutiveFailures = 0;
  let lastFailureTime = 0;

  const MAX_QUEUE_SIZE = 50;
  const BACKOFF_DURATION = 15000; // 15 seconds
  const LATENCY_THRESHOLD = 800; // 800ms

  const flushQueue = async () => {
    if (isFlushing || queue.length === 0) return;

    // Check backoff
    if (consecutiveFailures > 0 && Date.now() - lastFailureTime < BACKOFF_DURATION) {
      if (queue.length > MAX_QUEUE_SIZE) {
        queue.shift(); // Drop oldest if queue is full during backoff
      }
      return;
    }

    isFlushing = true;
    const batch = [...queue];
    queue = [];

    try {
      const telemetryUrl = import.meta.env?.VITE_SUPABASE_URL
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telemetry-ingress`
        : '/api/telemetry';

      const startTime = performance.now();

      const response = await fetch(telemetryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events: batch }) // Wrap in an object if needed, or just send batch if endpoint supports array
      });

      const latency = performance.now() - startTime;

      if (!response.ok) {
        throw new Error(`Telemetry dispatch failed with status ${response.status}`);
      }

      if (latency > LATENCY_THRESHOLD) {
        // High latency, treat as a partial failure to trigger backoff
        consecutiveFailures++;
        lastFailureTime = Date.now();
      } else {
        consecutiveFailures = 0;
      }
    } catch (err) {
      console.debug('Telemetry dispatch failed (network error):', err);
      consecutiveFailures++;
      lastFailureTime = Date.now();

      // Re-queue events, but limit size
      queue = [...batch, ...queue];
      while (queue.length > MAX_QUEUE_SIZE) {
        queue.shift();
      }
    } finally {
      isFlushing = false;
      if (queue.length > 0 && consecutiveFailures === 0) {
        // Schedule next flush if there are items and no failures
        setTimeout(flushQueue, 1000);
      }
    }
  };

  return async (eventName, payload = {}) => {
    try {
      const enrichedPayload = {
        event: eventName,
        details: {
          ...payload,
          path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        },
        timestamp: new Date().toISOString(),
        app_id: 'axim_core_frontend'
      };

      queue.push(enrichedPayload);

      if (queue.length >= 5 || consecutiveFailures === 0) {
         // Flush asynchronously without blocking the main thread
         setTimeout(flushQueue, 100);
      }

    } catch (error) {
      console.debug('Failed to compile telemetry payload:', error);
    }
  };
})();
