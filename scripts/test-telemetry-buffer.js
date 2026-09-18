import consumer from "../cloudflare-workers/src/telemetry-consumer.js";

const mockEnv = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_key"
};

const mockBatch = {
    messages: [
        {
            body: { event: "test_event_1", app_type: "test_app" },
            ack: () => console.log("Message 1 acked")
        },
        {
            body: { event: "test_event_2", app_type: "test_app" },
            ack: () => console.log("Message 2 acked")
        }
    ]
};

global.fetch = async (url, options) => {
    console.log(`Mock fetch called with URL: ${url}`);
    console.log(`Headers:`, options.headers);
    console.log(`Body:`, options.body);
    return { ok: true, text: async () => 'OK' };
};

(async () => {
    try {
        await consumer.queue(mockBatch, mockEnv);
        console.log("Telemetry consumer test completed successfully.");
    } catch (e) {
        console.error("Telemetry consumer test failed:", e);
    }
})();
