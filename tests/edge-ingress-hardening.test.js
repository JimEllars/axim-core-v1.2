/**
 * Proving tests for the edge ingress hardening in cloudflare-workers/src/index.js
 *
 * Before this change:
 *   - CORS headers lived in a module-level object that was mutated per request,
 *     so a reflected origin from request A was reused by request B (no Origin
 *     header) inside the same isolate.
 *   - CGI argument injection (?-d, auto_prepend_file, ...) and path traversal
 *     (.php, .., /wp-admin) were proxied straight through to the origin.
 *   - /api/v1/health was not routed at all: it fell into the /api/ proxy branch
 *     and returned 404 "API route not found".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, {
  buildCorsHeaders,
  isBlockedIngress,
  evaluateReplayHeader,
  REPLAY_WINDOW_SECONDS,
} from '../cloudflare-workers/src/index.js';

const env = {
  SUPABASE_URL: 'https://project.supabase.co',
  ALLOWED_ORIGINS: 'https://axim.us.com,http://localhost:5176',
};

const ctx = () => ({ waitUntil: vi.fn() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('edge ingress: CGI / traversal shielding', () => {
  const blocked = [
    '/api/v1/proxy?-d+allow_url_include%3D1',
    '/api/proxy?auto_prepend_file=/tmp/x',
    '/api/proxy?allow_url_include=1',
    '/index.php',
    '/wp-admin/options.php',
    '/api/../../etc/passwd',
    '/api/%2e%2e/%2e%2e/etc/passwd',
    '/api/proxy?auto_append_file=php://input',
    '/api/proxy?disable_functions=exec',
  ];

  for (const path of blocked) {
    it(`rejects ${path} with 403 before proxying`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const response = await worker.fetch(
        new Request(`https://api.axim.us.com${path}`, { method: 'POST' }),
        env,
        ctx(),
      );

      expect(response.status).toBe(403);
      // Nothing reached the origin.
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('still allows a clean telemetry POST through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://api.axim.us.com/telemetry-ingress', {
        method: 'POST',
        body: JSON.stringify({ event: 'heartbeat' }),
      }),
      env,
      ctx(),
    );

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('classifies ingress paths without a false positive on ordinary routes', () => {
    expect(isBlockedIngress('/api/v1/robotics/sim')).toBe(false);
    expect(isBlockedIngress('/api/system-status')).toBe(false);
    expect(isBlockedIngress('/assets/index-Bd3f.js')).toBe(false);
    expect(isBlockedIngress('/api/v1/leads/telemetry', '?since=2026-11-01')).toBe(false);
    expect(isBlockedIngress('/api/proxy', '?-d auto_prepend_file=x')).toBe(true);
  });
});

describe('edge ingress: replay window', () => {
  const now = 1_800_000_000;

  it('accepts a fresh timestamp', () => {
    expect(evaluateReplayHeader(String(now - 30), now)).toEqual({ ok: true, reason: 'fresh' });
  });

  it('tolerates an absent timestamp (satellites are not all emitting it yet)', () => {
    expect(evaluateReplayHeader(null, now)).toEqual({ ok: true, reason: 'absent' });
  });

  it('rejects a timestamp outside the 300s window', () => {
    expect(evaluateReplayHeader(String(now - REPLAY_WINDOW_SECONDS - 1), now)).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(evaluateReplayHeader(String(now + REPLAY_WINDOW_SECONDS + 1), now)).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('rejects an unparseable timestamp', () => {
    expect(evaluateReplayHeader('not-a-timestamp', now)).toEqual({
      ok: false,
      reason: 'unparseable',
    });
  });

  it('answers 401 for a stale header instead of forwarding', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const stale = String(Math.floor(Date.now() / 1000) - 3600);
    const response = await worker.fetch(
      new Request('https://api.axim.us.com/telemetry-ingress', {
        method: 'POST',
        headers: { 'X-Axim-Timestamp': stale },
        body: '{}',
      }),
      env,
      ctx(),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ reason: 'stale' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('edge ingress: per-request CORS', () => {
  it('reflects the requesting origin when it is allow-listed', () => {
    const headers = buildCorsHeaders('https://axim.us.com', ['https://axim.us.com', 'http://localhost:5176']);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://axim.us.com');
  });

  it('never reflects an unlisted origin', () => {
    const headers = buildCorsHeaders('https://evil.example', ['https://axim.us.com']);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://axim.us.com');
  });

  it('does not leak a previous request origin into a later request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    // Request 1 reflects https://axim.us.com
    const first = await worker.fetch(
      new Request('https://api.axim.us.com/api/system-status', {
        headers: { Origin: 'https://axim.us.com' },
      }),
      env,
      ctx(),
    );
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe('https://axim.us.com');

    // Request 2 comes from the other allow-listed origin. Mutating a shared
    // header object here is what used to poison request 3.
    const second = await worker.fetch(
      new Request('https://api.axim.us.com/api/system-status', {
        headers: { Origin: 'http://localhost:5176' },
      }),
      env,
      ctx(),
    );
    expect(second.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5176');

    // Request 3 has no Origin header. It must not inherit the localhost origin
    // that request 2 left in module scope.
    const third = await worker.fetch(
      new Request('https://api.axim.us.com/api/system-status'),
      env,
      ctx(),
    );
    expect(third.headers.get('Access-Control-Allow-Origin')).toBe('https://axim.us.com');
  });
});

describe('edge ingress: health probes', () => {
  it('answers GET /health', async () => {
    const response = await worker.fetch(
      new Request('https://api.axim.us.com/health'),
      env,
      ctx(),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ status: 'UP', service: 'axim-core-edge' });
  });

  it('answers GET /api/v1/health with 200 instead of 404', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(
      new Request('https://api.axim.us.com/api/v1/health'),
      env,
      ctx(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'UP' });
    // Handled at the edge, not proxied.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
