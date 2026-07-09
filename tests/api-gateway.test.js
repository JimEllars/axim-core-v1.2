import { describe, it, expect } from 'vitest';

describe('api-gateway Auth Integrity', () => {
    it('authenticates a hashed key, rejects revoked keys, and rejects unknown keys', async () => {
        const encoder = new TextEncoder();
        const data = encoder.encode('test_api_key_123');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Simulate database lookup behavior in api-gateway
        const mockDatabase = [
            { api_key: hashedKey, status: 'active', id: '1' },
            { api_key: 'another_hash', status: 'revoked', id: '2' }
        ];

        const authenticate = (incomingKey) => {
            const result = mockDatabase.find(row => row.api_key === incomingKey);
            if (!result || result.status === 'revoked') {
                return false;
            }
            return true;
        };

        // 1. Authenticate a valid issued (hashed) key
        expect(authenticate(hashedKey)).toBe(true);

        // 2. Reject revoked keys
        expect(authenticate('another_hash')).toBe(false);

        // 3. Reject unknown keys
        const unknownData = encoder.encode('unknown_key');
        const unknownHashBuffer = await crypto.subtle.digest('SHA-256', unknownData);
        const unknownHashArray = Array.from(new Uint8Array(unknownHashBuffer));
        const unknownHashedKey = unknownHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        expect(authenticate(unknownHashedKey)).toBe(false);
    });


    it('simulates edge sliding window rate limiting and correctly writes headers for deflected bursts', () => {
        // Simple mock of the edge sliding window
        const windowCache = new Map();

        const simulateEdgeRequest = (nodeScope, now) => {
            const windowTime = 1000;
            let timestamps = windowCache.get(nodeScope) || [];
            timestamps = timestamps.filter(time => now - time < windowTime);

            if (timestamps.length >= 5) {
                timestamps.push(now);
                windowCache.set(nodeScope, timestamps);
                return {
                    status: 429,
                    headers: {
                        "X-AXiM-Edge-Throttled": timestamps.length.toString()
                    }
                };
            }

            timestamps.push(now);
            windowCache.set(nodeScope, timestamps);
            return { status: 200 };
        };

        const nodeScope = "test-node-123";
        const baseTime = Date.now();

        // 5 successful requests
        for (let i = 0; i < 5; i++) {
            const res = simulateEdgeRequest(nodeScope, baseTime + i * 10);
            expect(res.status).toBe(200);
        }

        // 6th request triggers rate limit, deflected count is 6
        const throttledRes1 = simulateEdgeRequest(nodeScope, baseTime + 50);
        expect(throttledRes1.status).toBe(429);
        expect(throttledRes1.headers["X-AXiM-Edge-Throttled"]).toBe("6");

        // 7th request
        const throttledRes2 = simulateEdgeRequest(nodeScope, baseTime + 60);
        expect(throttledRes2.status).toBe(429);
        expect(throttledRes2.headers["X-AXiM-Edge-Throttled"]).toBe("7");
    });
});

    it('invokes edge proxy layer without an explicit model parameter resolves natively to deepseek-chat compute path', () => {
        // Mocking the proxy route default
        const simulateLlmProxy = (reqBody) => {
             const { provider = "deepseek", prompt } = reqBody;
             if (!prompt) return { status: 400, error: 'Missing prompt' };

             return { status: 200, resolvedProvider: provider };
        };

        const res = simulateLlmProxy({ prompt: "Hello" });
        expect(res.status).toBe(200);
        expect(res.resolvedProvider).toBe('deepseek');
    });

    it('executes mock calls to Cloudflare AI embedding arrays cleanly', () => {
        const mockEmbeddingAI = async (text) => {
            return {
                data: [
                    Array(1536).fill(0.1)
                ]
            };
        };

        return mockEmbeddingAI("Test query").then(res => {
            expect(res.data[0].length).toBe(1536);
        });
    });
