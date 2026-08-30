import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleLeadIngress } from "../index.ts";

const originalFetch = globalThis.fetch;

Deno.test("POST /api/v1/leads/ingress - success mutates payload", async () => {
    Deno.env.set("CF_ACCOUNT_ID", "test_acc");
    Deno.env.set("CF_API_TOKEN", "test_tok");
    Deno.env.set("SUPABASE_URL", "http://localhost:8000");

    let cfCalled = false;
    let triageCalled = false;
    let forwardedPayload: any = null;

    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = url.toString();
        if (urlStr.includes("@cf/meta/llama-3.1-8b-instruct")) {
            cfCalled = true;
            return new Response(JSON.stringify({
                result: {
                    response: '{"lead_score": 85, "reason": "Good match"}'
                }
            }), { status: 200, headers: { "Content-Type": "application/json" } });
        } else if (urlStr.includes("/lead-triage")) {
            triageCalled = true;
            forwardedPayload = JSON.parse(init?.body as string);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return originalFetch(url, init);
    };

    const req = new Request("http://localhost/api/v1/leads/ingress", {
        method: "POST",
        headers: { "Authorization": "Bearer test", "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: "Test Co", job_title: "CEO", company_size: "1-10" })
    });

    const res = await handleLeadIngress(req);

    assertEquals(cfCalled, true);
    assertEquals(triageCalled, true);
    assertEquals(forwardedPayload.axim_enrichment_data.edge_score, 85);
    assertEquals(forwardedPayload.axim_enrichment_data.reason, "Good match");
    assertEquals(res.status, 200);

    // Restore fetch
    globalThis.fetch = originalFetch;
});

Deno.test("POST /api/v1/leads/ingress - timeout/fail open forwards original payload", async () => {
    Deno.env.set("CF_ACCOUNT_ID", "test_acc");
    Deno.env.set("CF_API_TOKEN", "test_tok");
    Deno.env.set("SUPABASE_URL", "http://localhost:8000");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");

    let cfCalled = false;
    let triageCalled = false;
    let forwardedPayload: any = null;

    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = url.toString();
        if (urlStr.includes("@cf/meta/llama-3.1-8b-instruct")) {
            cfCalled = true;
            // Simulate a timeout/error by throwing an error or returning 500
            throw new Error("Network timeout");
        } else if (urlStr.includes("/lead-triage")) {
            triageCalled = true;
            forwardedPayload = JSON.parse(init?.body as string);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        } else if (urlStr.includes("/rest/v1/telemetry_logs")) {
            // Mock supabase telemetry logging insert
            return new Response(JSON.stringify([{ id: 1 }]), { status: 200, headers: { "Content-Type": "application/json" }});
        }
        return originalFetch(url, init);
    };

    const req = new Request("http://localhost/api/v1/leads/ingress", {
        method: "POST",
        headers: { "Authorization": "Bearer test", "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: "Test Co", job_title: "CEO", company_size: "1-10" })
    });

    const res = await handleLeadIngress(req);

    assertEquals(cfCalled, true);
    assertEquals(triageCalled, true);
    assertEquals(forwardedPayload.axim_enrichment_data.edge_score, null);
    assertEquals(res.status, 200);

    // Restore fetch
    globalThis.fetch = originalFetch;
});
