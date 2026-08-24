import { describe, it, expect, vi } from 'vitest';
import worker from '../cloudflare-workers/src/index.js';

describe('Edge Worker Rate Limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
        const mockEnv = {
            RATE_LIMITER: {
                limit: vi.fn().mockResolvedValue({ success: false })
            }
        };

        const headers = new Map([
            ['CF-Connecting-IP', '192.168.1.1'],
            ['Origin', 'https://axim.us.com']
        ]);

        const mockRequest = {
            method: 'GET',
            url: 'https://axim.us.com/api/test',
            headers: {
                get: (name) => headers.get(name) || null
            },
            cf: { colo: 'TEST' }
        };

        const response = await worker.fetch(mockRequest, mockEnv, { waitUntil: vi.fn() });
        expect(response.status).toBe(429);
        const data = await response.json();
        expect(data.error).toBe('Too Many Requests');
    });

    it('allows request when rate limit is not exceeded', async () => {
        const mockEnv = {
            SUPABASE_URL: 'https://test.supabase.co',
            RATE_LIMITER: {
                limit: vi.fn().mockResolvedValue({ success: true })
            }
        };

        const headers = new Map([
            ['CF-Connecting-IP', '192.168.1.1'],
            ['Origin', 'https://axim.us.com']
        ]);

        const mockRequest = {
            method: 'GET',
            url: 'https://axim.us.com/api/test',
            headers: {
                get: (name) => headers.get(name) || null
            },
            cf: { colo: 'TEST' }
        };

        global.fetch = vi.fn().mockResolvedValue({
            body: 'test',
            headers: new Map(),
            status: 200
        });

        // Add Request constructor polyfill
        global.Request = class Request {
            constructor(input, init) {
                this.url = input;
                this.method = init?.method || 'GET';
                this.headers = new Map();
            }
        };

        global.Response = class Response {
            constructor(body, init) {
                this.body = body;
                this.status = init?.status || 200;
                this.headers = new Map();
                if (init?.headers) {
                    for (const [key, value] of Object.entries(init.headers)) {
                        this.headers.set(key, value);
                    }
                }
            }
        };

        const response = await worker.fetch(mockRequest, mockEnv, { waitUntil: vi.fn() });
        expect(response.status).toBe(200);
    });
});
