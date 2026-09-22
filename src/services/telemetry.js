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

  const getStoredEvents = () => {
    try {
      const stored = localStorage.getItem('axim_telemetry_fallback');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  };

  const storeEvents = (events) => {
    try {
      localStorage.setItem('axim_telemetry_fallback', JSON.stringify(events));
    } catch (e) {
      // Silently ignore local storage errors
    }
  };

  // Initialize queue with any stored events
  if (typeof window !== 'undefined') {
    const stored = getStoredEvents();
    if (stored.length > 0) {
      queue = stored;
      storeEvents([]); // clear after loading
    }
  }


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
        if (response.status >= 500) {
           consecutiveFailures++;
           // Fallback silently to local storage
           if (typeof window !== 'undefined') {
             const stored = getStoredEvents();
             const newStored = [...stored, ...batch];
             storeEvents(newStored.slice(-MAX_QUEUE_SIZE)); // keep last MAX_QUEUE_SIZE
           }
           return;
        } else if (response.status === 429) {
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
      let tenantId = 'anonymous';
      try {
          const authData = localStorage.getItem('axim_session_token');
          if (authData) tenantId = 'authenticated'; // Placeholder logic, should parse JWT ideally
          const supabaseToken = localStorage.getItem('supabase.auth.token');
          if (supabaseToken) {
              const session = JSON.parse(supabaseToken);
              if (session.currentSession?.user?.id) {
                  tenantId = session.currentSession.user.id;
              }
          }
      } catch(e) {}

      const enrichedPayload = {
        event: eventName,
        details: {
          ...payload,
          path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
          tenant_id: tenantId,
          latency_timestamp: performance.now(),
        },
        timestamp: new Date().toISOString(),
        trace_id: generateTraceId(),
        app_id: 'axim_core_frontend',
        geo: {
            // Note: client side we don't have accurate colo/country without external IP service,
            // the worker typically overwrites this with cf.colo / cf.country
            client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      };

      queue.push(enrichedPayload);

      // We implement local in-memory ring buffering, up to MAX_QUEUE_SIZE.
      // Already implemented: dropping the oldest if over MAX_QUEUE_SIZE in flushQueue
      // when failures are happening. Let's make sure it drops them here too if over
      // max size before flush can process.
      while (queue.length > MAX_QUEUE_SIZE) {
        queue.shift();
      }

      // 25-event buffer batching mechanism
      if (queue.length >= 25) {
         // Flush asynchronously without blocking the main thread
         if (window.__axim_telemetry_timer) {
             clearTimeout(window.__axim_telemetry_timer);
             window.__axim_telemetry_timer = null;
         }
         // Use setTimeout with 0 to just yield to the event loop
         setTimeout(flushQueue, 0);
      } else {
         // Fallback 5-second flush timer
         if (!window.__axim_telemetry_timer) {
             window.__axim_telemetry_timer = setTimeout(() => {
                 if (queue.length > 0 && !isFlushing) {
                     flushQueue();
                 }
                 window.__axim_telemetry_timer = null;
             }, 5000);
         }
      }

    } catch (error) {
      console.debug('Failed to compile telemetry payload:', error);
    }
  };
})();
