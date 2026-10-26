export function authenticateMcpRequest(request: Request, env: any): boolean {
  const authHeader = request.headers.get("Authorization") || "";
  const customHeader = request.headers.get("X-Axim-Gateway-Token") || "";

  // Basic Auth (M2M)
  if (authHeader.startsWith("Basic ")) {
    try {
      const b64 = authHeader.replace("Basic ", "").trim();
      const decoded = atob(b64);
      const [clientId, clientSecret] = decoded.split(":");

      if (
        env.CF_ACCESS_CLIENT_ID &&
        env.CF_ACCESS_CLIENT_SECRET &&
        clientId === env.CF_ACCESS_CLIENT_ID &&
        clientSecret === env.CF_ACCESS_CLIENT_SECRET
      ) {
        return true;
      }
    } catch (e) {
    }
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || customHeader.trim();

  if (!token) return false;

  const allowedTokens = [
    env.AXIM_GATEWAY_TOKEN,
    env.AXIM_INTERNAL_KEY,
    env.MCP_GATEWAY_SECRET
  ].filter(Boolean);

  if (allowedTokens.length > 0) {
    for (const secret of allowedTokens) {
      if (token.length === secret.length) {
        let diff = 0;
        for (let i = 0; i < token.length; i++) {
          diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
        }
        if (diff === 0) return true;
      }
    }
  }

  return false;
}
