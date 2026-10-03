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
      const primaryUrl = import.meta.env?.VITE_CLOUDFLARE_WORKER_URL ? `${import.meta.env.VITE_CLOUDFLARE_WORKER_URL}/telemetry` : '/api/telemetry';
      const fallbackUrl = import.meta.env?.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telemetry-ingress` : '/api/telemetry';

      let delivered = false;
      const startTime = performance.now();
      const traceId = generateTraceId();

      const payloadObj = { batch: batch };
      const payloadStr = JSON.stringify(payloadObj);

      const headers = {
        'Content-Type': 'application/json',
        'x-trace-id': traceId,
        'x-client-timestamp': new Date().toISOString()
      };

      if (isUnload && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payloadStr], { type: 'application/json' });
        navigator.sendBeacon(primaryUrl, blob);
        // We can't know if sendBeacon succeeded but we assume it for unload
        return;
      }

      try {
        const response = await fetch(primaryUrl, {
          keepalive: true,
          method: 'POST',
          headers: headers,
          body: payloadStr
        });

        if (response.ok) {
           delivered = true;
           consecutiveFailures = 0;
           const latency = performance.now() - startTime;
           if (latency > LATENCY_THRESHOLD) {
             console.warn('[Telemetry] High latency on primary URL', latency);
           }
        } else {
            console.warn(`[Telemetry] Primary Cloudflare Worker failed with status ${response.status}, falling back to Supabase`);
            if (response.status >= 500 || response.status === 429) {
                consecutiveFailures++;
            }
        }
      } catch (err) {
        console.warn('[Telemetry] Cloudflare Worker network failure, falling back to Supabase', err);
        consecutiveFailures++;
      }

      if (!delivered) {
          const fallbackResponse = await fetch(fallbackUrl, {
             keepalive: true,
             method: 'POST',
             headers: headers,
             body: payloadStr
          });

          if (!fallbackResponse.ok) {
              throw new Error(`Telemetry fallback failed with status ${fallbackResponse.status}`);
          }
          consecutiveFailures = 0;
      }

    } catch (err) {
      console.debug('Telemetry dispatch failed (both primary and fallback):', err);
      consecutiveFailures++;
      lastFailureTime = Date.now();

      // Fallback silently to local storage
      if (typeof window !== 'undefined') {
        const stored = getStoredEvents();
        const newStored = [...stored, ...batch];
        storeEvents(newStored.slice(-MAX_QUEUE_SIZE)); // keep last MAX_QUEUE_SIZE
      }

      // Re-queue events, but limit size in memory too
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
      } catch(e) { /* ignore */ }

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
         setTimeout(() => flushQueue(false), 0);
      } else {
         // Fallback 15-second flush timer (debounce interval as requested)
         if (!window.__axim_telemetry_timer) {
             window.__axim_telemetry_timer = setTimeout(() => {
                 if (queue.length > 0 && !isFlushing) {
                     flushQueue(false);
                 }
                 window.__axim_telemetry_timer = null;
             }, 15000);
         }
      }

    } catch (error) {
      console.debug('Failed to compile telemetry payload:', error);
    }
  };
})();

export const logTelemetry = trackEvent;
