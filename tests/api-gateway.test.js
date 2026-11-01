import { vi } from 'vitest';
import { describe, it, expect } from 'vitest';

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


describe('Cloudflare Edge Degradation Resilience', () => {
    it('dispatches edge:degraded event and returns fallback object on 502/503/504 errors', async () => {
        vi.resetModules();

        // 1. Mock supabaseClient to simulate a 502 error from supabase.functions.invoke
        vi.doMock('../src/services/supabaseClient.js', () => {
            const createChainablePromise = (value) => {
                const promise = Promise.resolve(value);
                promise.catch = vi.fn().mockReturnValue(promise);
                return promise;
            };

            return {
                supabase: {
                    auth: {
                        getSession: vi.fn().mockReturnValue(createChainablePromise({ data: { session: null } }))
                    },
                    rpc: vi.fn().mockReturnValue(createChainablePromise({ data: null, error: null })),
                    from: vi.fn().mockReturnValue({
                        insert: vi.fn().mockReturnValue(createChainablePromise({ data: [], error: null })),
                        upsert: vi.fn().mockReturnValue({ setHeader: vi.fn().mockResolvedValue({ data: [], error: null }) })
                    }),
                    functions: {
                        // Simulate an edge failure
                        invoke: vi.fn().mockRejectedValue(new Error('502 Bad Gateway from Edge'))
                    }
                }
            };
        });

        const { callApiProxy } = await import('../src/services/apiProxy.js');

        let dispatchCalled = false;

        const originalDispatch = global.window.dispatchEvent;
        global.window.dispatchEvent = vi.fn().mockImplementation((event) => {
            if (event.type === 'edge:degraded') {
                dispatchCalled = true;
            }
        });

        if (typeof global.CustomEvent !== 'function') {
            global.CustomEvent = class CustomEvent {
                constructor(type, options) {
                    this.type = type;
                    this.detail = options ? options.detail : null;
                }
            };
        }

        const eventsDispatched = [];
        const listener = (e) => {
            eventsDispatched.push(e);
            dispatchCalled = true;
        };
        global.window.addEventListener('edge:degraded', listener);

        const result = await callApiProxy({
            integrationId: 'test',
            endpoint: '/test',
            method: 'GET'
        });

        expect(dispatchCalled).toBe(true);
        expect(result).toEqual({ error: true, message: "Edge service degraded", fallback: true });

        global.window.dispatchEvent = originalDispatch;
        global.window.removeEventListener('edge:degraded', listener);

        vi.resetModules();
    });

    it('dispatches edge:degraded event and returns fallback object on Error 1033', async () => {
        vi.resetModules();

        vi.doMock('../src/services/supabaseClient.js', () => {
            const createChainablePromise = (value) => {
                const promise = Promise.resolve(value);
                promise.catch = vi.fn().mockReturnValue(promise);
                return promise;
            };

            return {
                supabase: {
                    auth: {
                        getSession: vi.fn().mockReturnValue(createChainablePromise({ data: { session: null } }))
                    },
                    rpc: vi.fn().mockReturnValue(createChainablePromise({ data: null, error: null })),
                    from: vi.fn().mockReturnValue({
                        insert: vi.fn().mockReturnValue(createChainablePromise({ data: [], error: null })),
                        upsert: vi.fn().mockReturnValue({ setHeader: vi.fn().mockResolvedValue({ data: [], error: null }) })
                    }),
                    functions: {
                        invoke: vi.fn().mockRejectedValue(new Error('Cloudflare Error 1033 routing issue'))
                    }
                }
            };
        });

        const { callApiProxy } = await import('../src/services/apiProxy.js');

        let dispatchCalled = false;
        const originalDispatch = global.window.dispatchEvent;
        global.window.dispatchEvent = vi.fn().mockImplementation((event) => {
            if (event.type === 'edge:degraded') {
                dispatchCalled = true;
            }
        });

        if (typeof global.CustomEvent !== 'function') {
            global.CustomEvent = class CustomEvent {
                constructor(type, options) {
                    this.type = type;
                    this.detail = options ? options.detail : null;
                }
            };
        }

        const eventsDispatched = [];
        const listener = (e) => {
            eventsDispatched.push(e);
            dispatchCalled = true;
        };
        global.window.addEventListener('edge:degraded', listener);

        const result = await callApiProxy({
            integrationId: 'test',
            endpoint: '/test',
            method: 'GET'
        });

        expect(dispatchCalled).toBe(true);
        expect(result).toEqual({ error: true, message: "Edge service degraded", fallback: true });

        global.window.dispatchEvent = originalDispatch;
        global.window.removeEventListener('edge:degraded', listener);
        vi.resetModules();
    });
});

describe('apiProxy Rate Limit Event', () => {
    it('dispatches edge:ratelimit:update event when header is present', async () => {
        vi.resetModules();

        // Completely mock supabaseClient internally
        vi.doMock('../src/services/supabaseClient.js', () => {
            const createChainablePromise = (value) => {
                const promise = Promise.resolve(value);
                promise.catch = vi.fn().mockReturnValue(promise);
                return promise;
            };

            return {
                supabase: {
                    auth: {
                        getSession: vi.fn().mockReturnValue(createChainablePromise({ data: { session: null } }))
                    },
                    rpc: vi.fn().mockReturnValue(createChainablePromise({ data: null, error: null })),
                    from: vi.fn().mockReturnValue({
                        insert: vi.fn().mockReturnValue(createChainablePromise({ data: [], error: null })),
                        upsert: vi.fn().mockReturnValue({ setHeader: vi.fn().mockResolvedValue({ data: [], error: null }) })
                    }),
                    functions: {
                        invoke: vi.fn().mockImplementation(async () => {
                            return {
                                data: {
                                    headers: {
                                        'X-AXiM-RateLimit-Remaining': '42',
                                        'X-AXiM-API-Key': 'test-key'
                                    },
                                    status: 200
                                },
                                error: null
                            };
                        })
                    }
                }
            };
        });

        const { callApiProxy } = await import('../src/services/apiProxy.js');

        let capturedDetail = null;
        let dispatchCalled = false;

        const originalDispatch = global.window.dispatchEvent;
        global.window.dispatchEvent = vi.fn().mockImplementation((event) => {
            if (event.type === 'edge:ratelimit:update') {
                dispatchCalled = true;
                capturedDetail = event.detail;
            }
        });

        if (typeof global.CustomEvent !== 'function') {
            global.CustomEvent = class CustomEvent {
                constructor(type, options) {
                    this.type = type;
                    this.detail = options ? options.detail : null;
                }
            };
        }

        const eventsDispatched = [];
        const listener = (e) => {
            eventsDispatched.push(e);
            capturedDetail = e.detail;
            dispatchCalled = true;
        };
        global.window.addEventListener('edge:ratelimit:update', listener);

        try {
            await callApiProxy({
                integrationId: 'test',
                endpoint: '/test',
                method: 'GET',
                headers: { 'X-AXiM-API-Key': 'test-key' }
            });
        } catch (e) {
            console.error("API PROXY ERROR:", e);
        }

        await new Promise(r => setTimeout(r, 10));

        expect(dispatchCalled).toBe(true);
        expect(capturedDetail).not.toBeNull();
        expect(capturedDetail.remaining).toBe('42');

        global.window.dispatchEvent = originalDispatch;
        global.window.removeEventListener('edge:ratelimit:update', listener);

        vi.resetModules();
    });
});

describe('apiProxy Healthy Event', () => {
    it('dispatches edge:healthy event on successful HTTP 200 response', async () => {
        vi.resetModules();

        // Completely mock supabaseClient internally
        vi.doMock('../src/services/supabaseClient.js', () => {
            const createChainablePromise = (value) => {
                const promise = Promise.resolve(value);
                promise.catch = vi.fn().mockReturnValue(promise);
                return promise;
            };

            return {
                supabase: {
                    auth: {
                        getSession: vi.fn().mockReturnValue(createChainablePromise({ data: { session: null } }))
                    },
                    rpc: vi.fn().mockReturnValue(createChainablePromise({ data: null, error: null })),
                    from: vi.fn().mockReturnValue({
                        insert: vi.fn().mockReturnValue(createChainablePromise({ data: [], error: null })),
                        upsert: vi.fn().mockReturnValue({ setHeader: vi.fn().mockResolvedValue({ data: [], error: null }) })
                    }),
                    functions: {
                        invoke: vi.fn().mockImplementation(async () => {
                            return {
                                data: {
                                    status: 200
                                },
                                error: null
                            };
                        })
                    }
                }
            };
        });

        const { callApiProxy } = await import('../src/services/apiProxy.js');

        let dispatchCalled = false;

        const originalDispatch = global.window.dispatchEvent;
        global.window.dispatchEvent = vi.fn().mockImplementation((event) => {
            if (event.type === 'edge:healthy') {
                dispatchCalled = true;
            }
        });

        if (typeof global.CustomEvent !== 'function') {
            global.CustomEvent = class CustomEvent {
                constructor(type, options) {
                    this.type = type;
                    this.detail = options ? options.detail : null;
                }
            };
        }

        const eventsDispatched = [];
        const listener = (e) => {
            eventsDispatched.push(e);
            dispatchCalled = true;
        };
        global.window.addEventListener('edge:healthy', listener);

        try {
            await callApiProxy({
                integrationId: 'test',
                endpoint: '/test',
                method: 'GET'
            });
        } catch (e) {
            console.error("API PROXY ERROR:", e);
        }

        await new Promise(r => setTimeout(r, 10));

        expect(dispatchCalled).toBe(true);

        global.window.dispatchEvent = originalDispatch;
        global.window.removeEventListener('edge:healthy', listener);

        vi.resetModules();
    });
});

describe('Onyx MK3 Routing', () => {
    it('routes requests to external VITE_ONYX_MK3_URL when integrationId is onyx', async () => {
        vi.resetModules();

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ status: 'success', data: 'onyx-data' })
        });
        global.fetch = mockFetch;

        vi.doMock('../src/services/supabaseClient.js', () => {
            const createChainablePromise = (value) => {
                const promise = Promise.resolve(value);
                promise.catch = vi.fn().mockReturnValue(promise);
                return promise;
            };

            return {
                supabase: {
                    auth: {
                        getSession: vi.fn().mockReturnValue(createChainablePromise({ data: { session: { access_token: 'fake-jwt' } } }))
                    },
                    rpc: vi.fn(),
                    from: vi.fn().mockReturnValue({
                        insert: vi.fn().mockReturnValue(createChainablePromise({ data: [], error: null })),
                        upsert: vi.fn()
                    }),
                    functions: {
                        invoke: vi.fn()
                    }
                }
            };
        });

        // Setup env
        import.meta.env.VITE_ONYX_MK3_URL = 'https://test-onyx.workers.dev';

        const { callApiProxy } = await import('../src/services/apiProxy.js');

        const result = await callApiProxy({
            integrationId: 'onyx',
            endpoint: '/v1/chat',
            method: 'POST',
            body: { message: 'hello' }
        });

        expect(mockFetch).toHaveBeenCalledWith('https://test-onyx.workers.dev/v1/chat', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
                'Authorization': 'Bearer fake-jwt',
                'Content-Type': 'application/json'
            })
        }));
        expect(result).toEqual({ status: 'success', data: 'onyx-data' });

        vi.resetModules();
    });
});
