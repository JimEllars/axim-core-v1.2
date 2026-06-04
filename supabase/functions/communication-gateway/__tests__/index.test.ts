import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SUPABASE_URL = "https://mock.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "mock_service_key";
const ELLARS_MOBILE_NUMBER = "+19039332672";

vi.stubEnv('SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
vi.stubEnv('ELLARS_MOBILE_NUMBER', ELLARS_MOBILE_NUMBER);

async function handleRequest(req) {
    const origin = req.headers.get("origin");
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: {} });
    }

    try {
        const body = await req.json();

        // Extract sender email, the subject, and the parsed text body from the payload (EmailIt payload)
        const sender = body.sender || body.from?.email || body.From; // Handle EmailIt format
        const messageText = body.text_body || body.text || body.Body; // Handle EmailIt format
        const subject = body.subject || body.Subject || "";
        const channel = body.channel || (body.From ? "sms" : "email");

        if (!sender || !messageText) {
            return new Response(
                JSON.stringify({ error: "Missing sender or message" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // Authorized Sender Filter via DB
        // Mock Supabase DB call
        let allowedSender = null;
        if (sender === "james.ellars@axim.us.com") {
             allowedSender = { email_address: sender };
        }

        const isAuthorized = allowedSender != null || (ELLARS_MOBILE_NUMBER && sender === ELLARS_MOBILE_NUMBER);

        if (!isAuthorized) {
            return new Response(JSON.stringify({ error: "Unauthorized sender" }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Forward to onyx-bridge
        const onyxBridgeUrl = `${SUPABASE_URL}/functions/v1/onyx-bridge`;

        const bridgeResponse = await globalThis.fetch(onyxBridgeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                command: "admin_inbound_message",
                event_type: "admin_inbound_message",
                context: {
                    source_channel: channel,
                    message_text: messageText,
                    sender: sender,
                    subject: subject,
                },
            }),
        });

        if (!bridgeResponse.ok) {
            const errorText = await bridgeResponse.text();
            throw new Error(`Failed to forward to Onyx Bridge: ${errorText}`);
        }

        const bridgeData = await bridgeResponse.json();

        return new Response(
            JSON.stringify({
                status: "success",
                forwarded: true,
                onyx_response: bridgeData,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Communication Gateway Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal Server Error", message: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}

describe('Communication Gateway Allowlist Tests', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('rejects an unlisted email address with 403 Forbidden', async () => {
        const req = new Request('https://mock.example.com/communication-gateway', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sender: 'rogue.agent@unknown.com',
                text_body: 'Hack attempt'
            })
        });

        const res = await handleRequest(req);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toBe('Unauthorized sender');
    });

    it('accepts payloads from james.ellars@axim.us.com', async () => {
        const req = new Request('https://mock.example.com/communication-gateway', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sender: 'james.ellars@axim.us.com',
                text_body: 'Execute order 66',
                subject: 'Admin command'
            })
        });

        const res = await handleRequest(req);
        expect(res.status).toBe(200);

        expect(globalThis.fetch).toHaveBeenCalledWith(`${SUPABASE_URL}/functions/v1/onyx-bridge`, expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"sender":"james.ellars@axim.us.com"')
        }));
    });
});
