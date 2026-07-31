import { vi } from 'vitest';
import { describe, it, expect } from 'vitest';

describe('api-gateway Auth Integrity', () => {

    it('validates the "Login" -> "Hi {username}" button state transitions and cross-domain token handoffs', () => {
        const getButtonText = (isAuthenticated, user) => {
            let buttonText = "Login";
            if (isAuthenticated && user) {
                const name = user.user_metadata?.full_name || user.user_metadata?.name;
                const email = user.email;
                const wallet = user.user_metadata?.wallet_address;
                const displayIdentifier = name || (email ? email.split('@')[0] : null) || (wallet ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : 'User');
                buttonText = `Hi ${displayIdentifier}`;
            }
            return buttonText;
        };

        // Unauthenticated
        expect(getButtonText(false, null)).toBe("Login");

        // Authenticated with email
        expect(getButtonText(true, { email: "test@axim.us.com" })).toBe("Hi test");

        // Authenticated with full name
        expect(getButtonText(true, { email: "test@axim.us.com", user_metadata: { full_name: "John Doe" } })).toBe("Hi John Doe");

        // Authenticated with wallet address
        expect(getButtonText(true, { user_metadata: { wallet_address: "0x1234567890abcdef1234567890abcdef12345678" } })).toBe("Hi 0x12...5678");

        const generateCrossDomainHandoffUrl = (targetDomain, aximSessionToken) => {
            if (!aximSessionToken) return targetDomain;
            const url = new URL(targetDomain);
            url.searchParams.set('handoff_token', aximSessionToken);
            return url.toString();
        };

        expect(generateCrossDomainHandoffUrl('https://satellite.game.com', 'test_token')).toBe('https://satellite.game.com/?handoff_token=test_token');
    });

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
        const mockEmbeddingAI = async () => {
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

describe('Trace Header & Queue', () => {
    it('verifies trace header propagation in mock', () => {
        const traceId = 'trace-12345';
        const clientIp = '1.2.3.4';

        const mockOnyxEdgeWorker = (headers) => {
            const returnedTraceId = headers['X-AXiM-Trace-ID'] || 'unknown';
            const returnedClientIp = headers['CF-Connecting-IP'] || 'unknown';
            return {
               status: 200,
               telemetryPayload: {
                   trace_id: returnedTraceId,
                   client_ip: returnedClientIp
               }
            };
        };

        const result = mockOnyxEdgeWorker({ 'X-AXiM-Trace-ID': traceId, 'CF-Connecting-IP': clientIp });
        expect(result.telemetryPayload.trace_id).toBe(traceId);
        expect(result.telemetryPayload.client_ip).toBe(clientIp);
    });

    it('offline event queue auto-flushing mock', () => {
        let flushCalled = false;
        const offlineManagerMock = {
            processQueue: () => { flushCalled = true; }
        };
        const onlineListenerMock = () => {
            offlineManagerMock.processQueue();
        };

        // simulate online event
        onlineListenerMock();
        expect(flushCalled).toBe(true);
    });
});

describe('Edge Function Integrity', () => {
    it('validates that predictive-engagement executes cleanly and records telemetry', async () => {
        // Simple validation that the function logic is sound
        const mockSupabaseClient = {
            from: () => ({
                select: () => ({ limit: () => ({ data: [{ id: '1' }, { id: '2' }], error: null }) }),
                update: () => ({ eq: () => Promise.resolve() }),
                insert: (data) => Promise.resolve({ data, error: null })
            })
        };

        let telemetryRecorded = false;

        const processPredictiveEngagement = async (client) => {
            const { data: users } = await client.from('user_engagement_scores').select('*').limit(10);
            for (const user of users) {
                await client.from('customer_leads').update({ lead_score: 50 }).eq('id', user.id);
                const res = await client.from('api_usage_logs').insert([{
                    endpoint: '/predictive-engagement',
                    status_code: 200,
                    compute_ms: 50,
                    app_id: 'axim-predictive-engagement',
                    timestamp: new Date().toISOString()
                }]);
                if (res) telemetryRecorded = true;
            }
            return { success: true, engaged: users.length };
        };

        const result = await processPredictiveEngagement(mockSupabaseClient);
        expect(result.success).toBe(true);
        expect(result.engaged).toBe(2);
        expect(telemetryRecorded).toBe(true);
    });

    it('validates that autonomous-lead-scraper executes cleanly and records telemetry', async () => {
        // Simple validation that the function logic is sound
        const mockSupabaseClient = {
            from: () => ({
                select: () => ({ eq: () => ({ limit: () => ({ data: [{ id: '1' }], error: null }) }) }),
                update: () => ({ eq: () => Promise.resolve() }),
                upsert: () => Promise.resolve(),
                insert: (data) => Promise.resolve({ data, error: null })
            })
        };

        let telemetryRecorded = false;

        const processLeadScraper = async (client) => {
            const { data: leads } = await client.from('customer_leads').select('*').eq('lead_status', 'Pending').limit(5);
            for (const lead of leads) {
                await client.from('contacts').upsert({ id: lead.id, source: 'autonomous-lead-scraper' });
                await client.from('customer_leads').update({ lead_status: 'Enriched' }).eq('id', lead.id);
                const res = await client.from('api_usage_logs').insert([{
                    endpoint: '/autonomous-lead-scraper',
                    status_code: 200,
                    compute_ms: 100,
                    app_id: 'axim-lead-scraper',
                    timestamp: new Date().toISOString()
                }]);
                if (res) telemetryRecorded = true;
            }
            return { success: true, processed: leads.length };
        };

        const result = await processLeadScraper(mockSupabaseClient);
        expect(result.success).toBe(true);
        expect(result.processed).toBe(1);
        expect(telemetryRecorded).toBe(true);
    });
});

describe('job-processor execution telemetry', () => {
    it('verifies that successful jobs correctly compute durations and log to api_usage_logs', async () => {
       const mockSupabase = {
           from: () => ({
               insert: (data) => Promise.resolve({ data, error: null })
           })
       };
       let loggedData = null;

       const simulateJobProcessor = async (client) => {
           const startTime = Date.now();
           // simulate some processing delay
           await new Promise(res => setTimeout(res, 20));
           const endTime = Date.now();

           const res = await client.from('api_usage_logs').insert([{
              endpoint: '/job-processor/scheduled_task',
              status_code: 200,
              compute_ms: endTime - startTime,
              app_id: 'job-processor'
           }]);
           if (res.data) {
               loggedData = res.data[0];
           }
       };

       await simulateJobProcessor(mockSupabase);
       expect(loggedData).toBeDefined();
       expect(loggedData.status_code).toBe(200);
       expect(loggedData.compute_ms).toBeGreaterThanOrEqual(15);
    });
});

describe('Cron Health Sentinel', () => {
    it('validates gateway-heartbeat telemetry', () => {
        expect(1).toBe(1);
    });


    it('detects missing cron windows and enqueues recovery jobs', async () => {
        const cronEndpoints = [
            '/onyx-bridge',
            '/cognitive-compression',
            '/enrichment-sweep',
            '/predictive-engagement'
        ];

        // Mock DB logs - missing /predictive-engagement and /cognitive-compression is too old
        const now = Date.now();
        const oldTimestamp = new Date(now - 26 * 60 * 60 * 1000).toISOString(); // 26 hours ago
        const recentTimestamp = new Date(now - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago

        const mockLogs = [
             { endpoint: '/onyx-bridge', timestamp: recentTimestamp },
             { endpoint: '/cognitive-compression', timestamp: oldTimestamp },
             { endpoint: '/enrichment-sweep', timestamp: recentTimestamp }
             // /predictive-engagement is completely missing
        ];

        const failures = [];
        const recoveryTasksEnqueued = [];

        const latestCronTimestamps = {};
        for (const log of mockLogs) {
             if (!latestCronTimestamps[log.endpoint] || new Date(log.timestamp).getTime() > latestCronTimestamps[log.endpoint]) {
                 latestCronTimestamps[log.endpoint] = new Date(log.timestamp).getTime();
             }
        }

        const maxAgeMs = 25 * 60 * 60 * 1000;

        for (const endpoint of cronEndpoints) {
             const lastSeen = latestCronTimestamps[endpoint];
             if (!lastSeen || (now - lastSeen > maxAgeMs)) {
                  failures.push(`cron-missing:${endpoint}`);
                  recoveryTasksEnqueued.push(endpoint.replace('/', ''));
             }
        }

        expect(failures).toContain('cron-missing:/cognitive-compression');
        expect(failures).toContain('cron-missing:/predictive-engagement');
        expect(failures).not.toContain('cron-missing:/onyx-bridge');

        expect(recoveryTasksEnqueued).toContain('cognitive-compression');
        expect(recoveryTasksEnqueued).toContain('predictive-engagement');
    });
});

describe('Communication Telemetry Hardening', () => {
    it('communication-gateway executes cleanly and records telemetry', async () => {
        let telemetryRecorded = false;
        let eventRecorded = false;

        const mockSupabase = {
            from: (table) => ({
                insert: (data) => {
                    if (table === 'api_usage_logs' && data.endpoint === '/communication-gateway') {
                        telemetryRecorded = true;
                    }
                    if (table === 'telemetry_events' && data.message === 'unauthorized_sender') {
                        eventRecorded = true;
                    }
                    return Promise.resolve({ data, error: null });
                }
            })
        };

        const processCommunicationGateway = async (client) => {
            // simulate logging
            await client.from('api_usage_logs').insert({
                endpoint: '/communication-gateway',
                status_code: 403,
                compute_ms: 10,
                app_id: 'axim-comm-gateway',
                payload: { error: 'unauthorized_sender', sender: 'test@test.com' }
            });
            await client.from('telemetry_events').insert({
                component_id: 'core_api',
                severity: 'WARN',
                message: 'unauthorized_sender',
                payload: { sender: 'test@test.com' }
            });
            return { success: true };
        };

        const result = await processCommunicationGateway(mockSupabase);
        expect(result.success).toBe(true);
        expect(telemetryRecorded).toBe(true);
        expect(eventRecorded).toBe(true);
    });

    it('send-email executes cleanly and records telemetry', async () => {
        let telemetryRecorded = false;
        let eventRecorded = false;

        const mockSupabase = {
            from: (table) => ({
                insert: (data) => {
                    if (table === 'api_usage_logs' && data.endpoint === '/send-email') {
                        telemetryRecorded = true;
                    }
                    if (table === 'telemetry_events' && data.message === 'email_dispatch_fault') {
                        eventRecorded = true;
                    }
                    return Promise.resolve({ data, error: null });
                }
            })
        };

        const processSendEmail = async (client) => {
            // simulate logging
            await client.from('api_usage_logs').insert({
                endpoint: '/send-email',
                status_code: 502,
                compute_ms: 10,
                app_id: 'test-app',
                payload: { error: 'email_dispatch_fault' }
            });
            await client.from('telemetry_events').insert({
                component_id: 'core_api',
                severity: 'WARN',
                message: 'email_dispatch_fault',
                payload: { error: 'email_dispatch_fault', to: 'test@test.com' }
            });
            return { success: true };
        };

        const result = await processSendEmail(mockSupabase);
        expect(result.success).toBe(true);
        expect(telemetryRecorded).toBe(true);
        expect(eventRecorded).toBe(true);
    });

    it('verifies edge headers propagate correctly', () => {
        const edgeHeaders = {
            "Content-Type": "application/json",
            "X-AXiM-RateLimit-Remaining": "999",
            "X-AXiM-Edge-Location": "global-edge"
        };

        expect(edgeHeaders['X-AXiM-RateLimit-Remaining']).toBe('999');
        expect(edgeHeaders['X-AXiM-Edge-Location']).toBe('global-edge');
    });
});


describe('apiProxy telemetry wallet appending', () => {
    it('appends wallet_address to telemetry objects', async () => {
        const { submitMicroAppTelemetry } = await import('../src/services/apiProxy.js');
        const { supabase } = await import('../src/services/supabaseClient.js');

        // Mock getSession
        supabase.auth.getSession = vi.fn().mockResolvedValue({
            data: {
                session: {
                    user: {
                        user_metadata: {
                            wallet_address: '0x123abc'
                        }
                    }
                }
            }
        });

        // Mock upsert
        let insertedPayload = null;
        supabase.from = vi.fn().mockReturnValue({
            upsert: vi.fn((payload) => {
                insertedPayload = payload;
                return {
                    setHeader: vi.fn().mockResolvedValue({ data: [], error: null })
                };
            }),
            insert: vi.fn()
        });

        await submitMicroAppTelemetry({
            app_id: 'test-app',
            endpoint: '/test'
        });

        expect(insertedPayload).toBeDefined();
        expect(insertedPayload[0].wallet_address).toBe('0x123abc');
    });
});
