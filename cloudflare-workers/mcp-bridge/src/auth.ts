export function authenticateMcpRequest(request: Request, env: any): boolean {
  const authHeader = request.headers.get("Authorization") || "";
  const customHeader = request.headers.get("X-Axim-Gateway-Token") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim() || customHeader.trim();

  if (!token) return false;

  const allowedTokens = [
    env.AXIM_GATEWAY_TOKEN,
    env.AXIM_INTERNAL_KEY,
    env.MCP_GATEWAY_SECRET
  ].filter(Boolean);

  if (allowedTokens.length === 0) return false;

  for (const secret of allowedTokens) {
    if (token.length === secret.length) {
      let diff = 0;
      for (let i = 0; i < token.length; i++) {
        diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
      }
      if (diff === 0) return true;
    }
  }
  return false;
}
