export const trackEvent = (() => {
  let queue = [];
  let isFlushing = false;
  let consecutiveFailures = 0;
  let lastFailureTime = 0;

  const MAX_QUEUE_SIZE = 50;
  const BACKOFF_DURATION = 15000; // 15 seconds
  const LATENCY_THRESHOLD = 800; // 800ms

  const generateTraceId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const flushQueue = async (isUnload = false) => {
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
      const primaryUrl = import.meta.env?.VITE_CLOUDFLARE_WORKER_URL ? `${import.meta.env.VITE_CLOUDFLARE_WORKER_URL}/api/telemetry` : '/api/telemetry';
      const fallbackUrl = import.meta.env?.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telemetry-ingress` : '/api/telemetry';

      let telemetryUrl = primaryUrl;
      let useFallback = consecutiveFailures > 2; // Trip circuit breaker after 2 failures
      if (useFallback) {
         telemetryUrl = fallbackUrl;
      }

      const startTime = performance.now();

      const traceId = generateTraceId();

      if (isUnload && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
        navigator.sendBeacon(telemetryUrl, blob);
        return;
      }
      const response = await fetch(telemetryUrl, {
        keepalive: isUnload,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-trace-id': traceId,
          'x-client-timestamp': new Date().toISOString()
        },
        body: JSON.stringify({ events: batch })
      });

      const latency = performance.now() - startTime;

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
           consecutiveFailures++;
           if (!useFallback && consecutiveFailures > 2) {
              // Re-queue to immediately retry with fallback
              queue = [...batch, ...queue];
              setTimeout(flushQueue, 100);
              return;
           }
        }
        throw new Error(`Telemetry dispatch failed with status ${response.status}`);
      }

      if (latency > LATENCY_THRESHOLD) {
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


  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      flushQueue(true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushQueue(true);
      }
    });
  }

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
        trace_id: generateTraceId(),
        app_id: 'axim_core_frontend'
      };

      queue.push(enrichedPayload);

      // We implement local in-memory ring buffering, up to MAX_QUEUE_SIZE.
      // Already implemented: dropping the oldest if over MAX_QUEUE_SIZE in flushQueue
      // when failures are happening. Let's make sure it drops them here too if over
      // max size before flush can process.
      while (queue.length > MAX_QUEUE_SIZE) {
        queue.shift();
      }

      if (queue.length >= 5 || consecutiveFailures === 0) {
         // Flush asynchronously without blocking the main thread
         setTimeout(flushQueue, 100);
      }

    } catch (error) {
      console.debug('Failed to compile telemetry payload:', error);
    }
  };
})();
