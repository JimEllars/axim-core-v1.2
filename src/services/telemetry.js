export const trackEvent = async (eventName, payload = {}) => {
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

    const telemetryUrl = import.meta.env?.VITE_SUPABASE_URL
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telemetry-ingress`
      : '/api/telemetry';

    // Fire and forget
    fetch(telemetryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(enrichedPayload)
    }).catch(err => {
      // Fail gracefully
      console.debug('Telemetry dispatch failed (network error):', err);
    });

  } catch (error) {
    // Fail gracefully
    console.debug('Failed to compile telemetry payload:', error);
  }
};
