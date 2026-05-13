import { env, createExecutionContext } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import worker from "../src/index.js";

describe("Edge Gateway Worker Integration Tests", () => {
  it("An OPTIONS request returns a 204 with correct CORS headers", async () => {
    const request = new Request("http://example.com", {
      method: "OPTIONS",
      headers: {
        "Origin": "https://axim.us.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, DELETE, OPTIONS");
  });

  it("A request to /api/mcp correctly proxies to the backend", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("proxied response", { status: 200 }));
    globalThis.fetch = mockFetch;

    const request = new Request("http://example.com/api/mcp", { method: "GET" });
    const ctx = createExecutionContext();

    const testEnv = {
      ...env,
      GCP_BACKEND_URL: "https://gcp.axim.us.com",
    };

    const response = await worker.fetch(request, testEnv, ctx);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0][0];
    expect(fetchArgs.url).toBe("https://gcp.axim.us.com/api/mcp");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("proxied response");
  });

  it("A request from an IP exceeding 100 requests/minute correctly receives a 429 Too Many Requests", async () => {
    const ip = "1.2.3.4";
    const ctx = createExecutionContext();
    const testEnv = {
      ...env,
      GCP_BACKEND_URL: "https://gcp.axim.us.com",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    for (let i = 0; i < 100; i++) {
        const req = new Request("http://example.com/api/test", {
            method: "GET",
            headers: { "CF-Connecting-IP": ip }
        });
        await worker.fetch(req, testEnv, ctx);
    }

    const req = new Request("http://example.com/api/test", {
        method: "GET",
        headers: { "CF-Connecting-IP": ip }
    });
    const response = await worker.fetch(req, testEnv, ctx);

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("Too Many Requests");
  });

  it("A request to a non-existent frontend asset correctly returns the index.html fallback with Cache-Control: no-store", async () => {
    const request = new Request("http://example.com/some/random/route", { method: "GET" });
    const ctx = createExecutionContext();

    const mockAssetsFetch = vi.fn().mockImplementation(async (req) => {
        if (req.url.endsWith("/index.html")) {
            return new Response("index content", { status: 200 });
        }
        return new Response("Not found", { status: 404 });
    });

    const testEnv = {
      ...env,
      ASSETS: {
          fetch: mockAssetsFetch
      }
    };

    const response = await worker.fetch(request, testEnv, ctx);

    expect(mockAssetsFetch).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);

    const clonedResponse = new Response(response.body, response);
    expect(await clonedResponse.text()).toBe("index content");

    expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate, proxy-revalidate");
  });
});
