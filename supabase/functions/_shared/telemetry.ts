export async function logTelemetry(endpoint: string, errorCode: number, details: any = {}, severity: string = 'INFO') {
  if (errorCode >= 500) {
      severity = 'CRITICAL';
  } else if (errorCode >= 400) {
      severity = 'WARNING';
  }

  const onyxUrl = Deno.env.get('ONYX_EDGE_URL');
  if (!onyxUrl) {
    console.warn('ONYX_EDGE_URL not set, skipping telemetry dispatch.');
    return;
  }

  try {
    await fetch(`https://${onyxUrl}/api/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error_code: errorCode,
        endpoint,
        timestamp: new Date().toISOString(),
        details,
        severity
      })
    });

    if (severity === 'CRITICAL') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (supabaseUrl && serviceRoleKey) {
          const systemPrompt = `[SYSTEM ALERT: Micro-app crash detected in ${endpoint}. Log details: ${JSON.stringify(details)}]`;

          fetch(`${supabaseUrl}/functions/v1/onyx-bridge`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({ prompt: systemPrompt })
          }).catch(err => console.error('Failed to trigger Onyx bridge analysis:', err));
      }
    }
  } catch (err) {
    console.error('Failed to notify Onyx mk3:', err);
  }
}

export async function notifyOnyx(endpoint: string, errorCode: number, details: any = {}) {
  return logTelemetry(endpoint, errorCode, details);
}
