import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';
import onyxWorker from '../onyx-edge-worker/src/index.ts';

describe('Onyx Edge Worker', () => {
  it('does not invoke AI or Supabase side effects for unauthenticated requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const aiRun = vi.fn();

    const response = await onyxWorker.fetch(
      new Request('https://onyx.example/api/v1/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'test prompt' })
      }),
      {
        ALLOWED_ORIGINS: 'http://localhost:5176',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        AI: { run: aiRun }
      },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(401);
    expect(aiRun).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('Cloudflare Worker Integration', () => {
  it('allows configured CORS origins, including the Vite dev origin, and rejects unconfigured origins', async () => {
    const env = {
      ALLOWED_ORIGINS: 'https://axim.us.com,http://localhost:5176',
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

    const localResponse = await worker.fetch(
      new Request('https://edge.example/api/system-status', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5176' }
      }),
      env,
      { waitUntil: vi.fn() }
    );
    expect(localResponse.status).toBe(204);
    expect(localResponse.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5176');
  });

  it('returns a clear service error when the backend binding is absent', async () => {
    const response = await worker.fetch(
      new Request('https://edge.example/api/system-status'),
      { ALLOWED_ORIGINS: 'https://axim.us.com' },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('API backend is not configured');
  });

  it('rewrites supported edge routes to their Supabase function endpoints', async () => {
    const request = new Request('https://axim.us.com/api/system-status', {
      method: 'GET'
    });

    const env = { SUPABASE_URL: 'https://gcp.axim.us.com' };
    const ctx = { waitUntil: vi.fn() };
    vi.stubGlobal('caches', {
      default: { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) }
    });

    // Mock the global fetch for the proxy
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('backend response', {
      headers: { 'Content-Type': 'application/json' }
    }));

    const response = await worker.fetch(request, env, ctx);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://gcp.axim.us.com/functions/v1/system-status'
      })
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
  });

  it('returns a readable response while asynchronously caching supported endpoints', async () => {
    const cachePut = vi.fn().mockResolvedValue(undefined);
    const originalCaches = globalThis.caches;
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { default: { match: vi.fn().mockResolvedValue(undefined), put: cachePut } }
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('backend response'));
    const waitUntil = vi.fn((promise) => promise);

    const response = await worker.fetch(
      new Request('https://edge.example/api/system-status'),
      { SUPABASE_URL: 'https://gcp.axim.us.com' },
      { waitUntil }
    );

    await expect(response.text()).resolves.toBe('backend response');
    expect(cachePut).toHaveBeenCalledOnce();
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
  });

  it('rejects unsupported API paths instead of proxying them to an invalid origin path', async () => {
    const response = await worker.fetch(
      new Request('https://edge.example/api/test'),
      { SUPABASE_URL: 'https://gcp.axim.us.com' },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('API route not found');
  });
});
