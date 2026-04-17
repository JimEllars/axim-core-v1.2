export async function notifyOnyx(endpoint: string, errorCode: number, details: any = {}) {
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
        details
      })
    });
  } catch (err) {
    console.error('Failed to notify Onyx mk3:', err);
  }
}
