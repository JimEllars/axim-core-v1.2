// Simple in-memory rate limiter for demonstration/test.
// In a real CF worker this might use KV or Durable Objects, but we can do a simple version for the tests or KV if available.
const operatorRequests = new Map<string, number[]>();

export async function checkRateLimit(request: Request, env: any): Promise<Response | null> {
  const authHeader = request.headers.get('Authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return null; // Let auth handle missing token
  const token = tokenMatch[1].trim();

  // We'll use the token as the identifier since we don't have the parsed email here easily without double-verifying.
  // Alternatively we can use IP or CF-Connecting-IP.
  // The spec says "sliding window hourly rate limiter (default 60 calls/hour per operator)"
  const identifier = token;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const limit = 60;

  let requests = operatorRequests.get(identifier) || [];
  requests = requests.filter(time => now - time < windowMs);

  if (requests.length >= limit) {
    const oldestRequest = requests[0];
    const retryAfterSeconds = Math.ceil((oldestRequest + windowMs - now) / 1000);
    return new Response(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds.toString()
      }
    });
  }

  requests.push(now);
  operatorRequests.set(identifier, requests);

  return null;
}
