export async function checkKillSwitch(env: any): Promise<Response | null> {
  if (env.LAB_STATE) {
    try {
      const suspended = await env.LAB_STATE.get('OPERATOR_DOCK_SUSPENDED');
      if (suspended === 'true') {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32004, message: "Service Unavailable: Operator Dock Suspended" }
        }), { status: 503, headers: { "Content-Type": "application/json" } });
      }
    } catch (e) {
      // Error reading KV
    }
  } else if (env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32004, message: "Service Unavailable: Kill Switch Missing" }
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }
  return null;
}
