import { describe, it, expect, vi } from 'vitest';

// Simulate the logic in supabase/functions/webhook-dispatch/index.ts
async function generateHmacSignature(payload, secretKey) {
    // Simplified for benchmarking
    return "mock-signature";
}

async function originalDispatch(webhooks, payload, fileUrl) {
    const dispatchResults = [];
    const webhookPayload = JSON.stringify(payload);

    for (const webhook of webhooks) {
        try {
            if (webhook.sync_type === 'blob' && fileUrl) {
                const fileResponse = await fetch(fileUrl);
                if (!fileResponse.ok) {
                    throw new Error("Failed to fetch file for blob sync");
                }

                const response = await fetch(webhook.endpoint_url, {
                    method: "PUT",
                    headers: {
                        "Content-Type": fileResponse.headers.get("content-type") || "application/octet-stream"
                    },
                    body: fileResponse.body
                });

                dispatchResults.push({
                    endpoint: webhook.endpoint_url,
                    status: response.status,
                    success: response.ok,
                    type: 'blob'
                });
            } else {
                const signature = await generateHmacSignature(webhookPayload, webhook.secret_key);

                const response = await fetch(webhook.endpoint_url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-AXiM-Signature": signature
                    },
                    body: webhookPayload
                });

                dispatchResults.push({
                    endpoint: webhook.endpoint_url,
                    status: response.status,
                    success: response.ok,
                    type: 'webhook'
                });
            }
        } catch (err) {
            dispatchResults.push({
                endpoint: webhook.endpoint_url,
                error: err.message,
                success: false
            });
        }
    }
    return dispatchResults;
}

async function optimizedDispatch(webhooks, payload, fileUrl) {
    const webhookPayload = JSON.stringify(payload);

    const dispatchPromises = webhooks.map(async (webhook) => {
        try {
            if (webhook.sync_type === 'blob' && fileUrl) {
                const fileResponse = await fetch(fileUrl);
                if (!fileResponse.ok) {
                    throw new Error("Failed to fetch file for blob sync");
                }

                const response = await fetch(webhook.endpoint_url, {
                    method: "PUT",
                    headers: {
                        "Content-Type": fileResponse.headers.get("content-type") || "application/octet-stream"
                    },
                    body: fileResponse.body
                });

                return {
                    endpoint: webhook.endpoint_url,
                    status: response.status,
                    success: response.ok,
                    type: 'blob'
                };
            } else {
                const signature = await generateHmacSignature(webhookPayload, webhook.secret_key);

                const response = await fetch(webhook.endpoint_url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-AXiM-Signature": signature
                    },
                    body: webhookPayload
                });

                return {
                    endpoint: webhook.endpoint_url,
                    status: response.status,
                    success: response.ok,
                    type: 'webhook'
                };
            }
        } catch (err) {
            return {
                endpoint: webhook.endpoint_url,
                error: err.message,
                success: false
            };
        }
    });

    return await Promise.all(dispatchPromises);
}

describe('Webhook Dispatch Benchmark', () => {
    const mockWebhooks = Array.from({ length: 10 }, (_, i) => ({
        endpoint_url: `https://mock-endpoint-${i}.com`,
        secret_key: `secret-${i}`,
        sync_type: i % 2 === 0 ? 'blob' : 'webhook'
    }));

    const payload = { event: "document.generated", data: { documentId: "123" } };
    const fileUrl = "https://mock-file-url.com/file.pdf";

    // Mock fetch
    global.fetch = vi.fn().mockImplementation((url) => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    ok: true,
                    status: 200,
                    headers: {
                        get: () => "application/pdf"
                    },
                    body: "mock-body"
                });
            }, 100); // Simulate 100ms latency per fetch
        });
    });

    it('benchmarks original vs optimized dispatch', async () => {
        const startOriginal = Date.now();
        await originalDispatch(mockWebhooks, payload, fileUrl);
        const endOriginal = Date.now();
        const durationOriginal = endOriginal - startOriginal;

        const startOptimized = Date.now();
        await optimizedDispatch(mockWebhooks, payload, fileUrl);
        const endOptimized = Date.now();
        const durationOptimized = endOptimized - startOptimized;

        console.log(`Original Dispatch (Sequential): ${durationOriginal}ms`);
        console.log(`Optimized Dispatch (Concurrent): ${durationOptimized}ms`);

        expect(durationOptimized).toBeLessThan(durationOriginal);
    });
});
