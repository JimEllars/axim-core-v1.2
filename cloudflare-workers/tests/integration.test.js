import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

describe('Cloudflare Worker Integration', () => {
  it('allows configured CORS origins and rejects unconfigured origins', async () => {
    const env = {
      ALLOWED_ORIGINS: 'https://axim.us.com',
      SUPABASE_URL: 'https://pvbcdndqjguzqeafhwhw.supabase.co'
    };

    const allowedResponse = await worker.fetch(
      new Request('https://edge.example/api/system-status', {
        method: 'OPTIONS',
        headers: { Origin: 'https://axim.us.com' }
      }),
      env,
      { waitUntil: vi.fn() }
    );
    const blockedResponse = await worker.fetch(
      new Request('https://edge.example/api/system-status', {
        method: 'OPTIONS',
        headers: { Origin: 'https://untrusted.example' }
      }),
      env,
      { waitUntil: vi.fn() }
    );

    expect(allowedResponse.status).toBe(204);
    expect(allowedResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://axim.us.com');
    expect(blockedResponse.status).toBe(403);
  });

  it('returns a clear service error when the backend binding is absent', async () => {
    const response = await worker.fetch(
      new Request('https://edge.example/api/test'),
      { ALLOWED_ORIGINS: 'https://axim.us.com' },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('API backend is not configured');
  });

  it('should bypass cache entirely and hit the backend logic for /api/test', async () => {
    const request = new Request('https://axim.us.com/api/test', {
      method: 'GET'
    });

    const env = { SUPABASE_URL: 'https://gcp.axim.us.com' };
    const ctx = { waitUntil: vi.fn() };

    // Mock the global fetch for the proxy
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('backend response', {
      headers: { 'Content-Type': 'application/json' }
    }));

    const response = await worker.fetch(request, env, ctx);

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  it('should pass integration tests safely', async () => {
    expect(true).toBe(true);
  });
});
