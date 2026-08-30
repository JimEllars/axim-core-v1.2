import { assertEquals, assertExists } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { handleRequest } from '../index.ts';

// Mocking environment variables
const originalEnvGet = Deno.env.get;
Deno.env.get = (key: string) => {
  if (key === 'OPENAI_API_KEY') return 'test-openai-key';
  if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
  if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-key';
  if (key === 'CF_ACCOUNT_ID') return 'test-cf-account';
  if (key === 'CF_VECTORIZE_INDEX_NAME') return 'test-vectorize-index';
  if (key === 'CF_API_TOKEN') return 'test-cf-token';
  return originalEnvGet(key);
};

Deno.test('Dual-write sync executed cleanly', async () => {
  // We will mock global fetch
  const originalFetch = globalThis.fetch;
  let fetchCalls: any[] = [];

  globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
    fetchCalls.push({ url, options });
    const urlStr = url.toString();
    if (urlStr.includes('api.openai.com')) {
      return new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      }), { status: 200, statusText: 'OK' });
    } else if (urlStr.includes('api.cloudflare.com')) {
      return new Response(JSON.stringify({ success: true }), { status: 200, statusText: 'OK' });
    } else if (urlStr.includes('test.supabase.co')) {
      return new Response(JSON.stringify([{ id: 'test-uuid-123' }]), { status: 201, statusText: 'Created' });
    }
    return originalFetch(url, options);
  };

  try {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        input: 'test text',
        user_id: 'user1',
        conversation_id: 'conv1',
      })
    });

    const res = await handleRequest(req);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.logged, true);
    assertEquals(body.embedding, [0.1, 0.2, 0.3]);

    const cfFetchCall = fetchCalls.find(call => call.url.toString().includes('api.cloudflare.com'));
    assertExists(cfFetchCall, 'Cloudflare Vectorize API should be called');

  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('Mocked Vectorize API failure results in 200 OK', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: any[] = [];

  globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
    fetchCalls.push({ url, options });
    const urlStr = url.toString();
    if (urlStr.includes('api.openai.com')) {
      return new Response(JSON.stringify({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      }), { status: 200, statusText: 'OK' });
    } else if (urlStr.includes('api.cloudflare.com')) {
      // Simulate API failure
      return new Response('Vectorize Error', { status: 500, statusText: 'Internal Server Error' });
    } else if (urlStr.includes('test.supabase.co')) {
      return new Response(JSON.stringify([{ id: 'test-uuid-123' }]), { status: 201, statusText: 'Created' });
    }
    return originalFetch(url, options);
  };

  try {
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        input: 'test text',
        user_id: 'user1',
        conversation_id: 'conv1',
      })
    });

    const res = await handleRequest(req);
    // Should still return 200 OK because of fail-open error handling
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.logged, true);
    assertEquals(body.embedding, [0.1, 0.2, 0.3]);

    const cfFetchCall = fetchCalls.find(call => call.url.toString().includes('api.cloudflare.com'));
    assertExists(cfFetchCall, 'Cloudflare Vectorize API should be called');

  } finally {
    globalThis.fetch = originalFetch;
  }
});
