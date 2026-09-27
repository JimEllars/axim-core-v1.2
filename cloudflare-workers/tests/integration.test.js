import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

describe('Integration Tests', () => {
    const env = {
        SUPABASE_URL: 'https://project.supabase.co',
        ALLOWED_ORIGINS: 'https://dashboard.example.com',
    };

    it('rejects CORS preflight requests from unapproved origins', async () => {
        const response = await worker.fetch(
            new Request('https://edge.example.com/api/system-status', {
                method: 'OPTIONS',
                headers: { Origin: 'https://untrusted.example.com' },
            }),
            env,
            { waitUntil: vi.fn() },
        );

        expect(response.status).toBe(403);
    });

    it('forwards telemetry without writing invalid optional geo headers', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
        vi.stubGlobal('fetch', fetchMock);
        const waitUntil = vi.fn((promise) => promise);

        const response = await worker.fetch(
            new Request('https://edge.example.com/telemetry-ingress', {
                method: 'POST',
                body: JSON.stringify({ event: 'heartbeat' }),
            }),
            env,
            { waitUntil },
        );

        expect(response.status).toBe(202);
        expect(waitUntil).toHaveBeenCalledOnce();
        const forwardedRequest = fetchMock.mock.calls[0][0];
        expect(forwardedRequest.headers.get('x-cf-ipcountry')).toBe('XX');
        expect(forwardedRequest.headers.has('x-cf-region')).toBe(false);
        expect(forwardedRequest.headers.has('x-cf-city')).toBe(false);
        expect(forwardedRequest.headers.has('x-cf-asn')).toBe(false);
        vi.unstubAllGlobals();
    });

    it('proxies recognized API routes to the mapped Supabase function', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ status: 'healthy' }), {
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const response = await worker.fetch(
            new Request('https://edge.example.com/api/system-status', {
                headers: { Origin: 'https://dashboard.example.com' },
            }),
            env,
            { waitUntil: vi.fn() },
        );

        expect(response.status).toBe(200);
        expect(fetchMock.mock.calls[0][0].url).toBe(
            'https://project.supabase.co/functions/v1/system-status',
        );
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://dashboard.example.com',
        );
        vi.unstubAllGlobals();
    });
});
