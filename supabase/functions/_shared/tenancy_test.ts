/**
 * Tenancy tests for the recall path.
 *
 * These exercise the real `memory-retrieval` handler under Deno with `fetch`
 * stubbed, and assert the tenant rules that the migration enforces in SQL:
 *
 *   - internal callers must state a tenant explicitly
 *   - user callers are scoped to the tenant in their verified token, and a
 *     body-supplied tenant cannot override it
 *   - no tenant means 400, never an all-tenant fallback
 *
 * Run: deno test --config /tmp/deno-fn.json --allow-env _shared/tenancy_test.ts
 */
import { assertEquals, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts";

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.sig`;
}

function setEnv(values: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = Deno.env.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };
}

interface Captured {
  tenantParam: string | null;
  rpcCalls: string[];
}

/** Stub Supabase: auth.getUser returns `user`, RPCs return no rows. */
function stubSupabase(user: { id: string } | null) {
  const captured: Captured = { tenantParam: null, rpcCalls: [] };
  const original = globalThis.fetch;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(JSON.stringify(user ?? {}), {
          status: user ? 200 : 401,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // Supabase RPCs are POSTs to /rest/v1/rpc/<name> with a JSON body.
    const rpcMatch = url.match(/\/rest\/v1\/rpc\/([a-z_]+)/i);
    if (rpcMatch) {
      captured.rpcCalls.push(rpcMatch[1]);
      try {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (typeof body.p_tenant_id === "string") captured.tenantParam = body.p_tenant_id;
      } catch {
        // ignore
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;

  return {
    captured,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

Deno.test("memory-retrieval rejects an internal caller that omits tenant_id", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    OPENAI_API_KEY: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_API_TOKEN: undefined,
  });
  const stub = stubSupabase(null);
  try {
    const { handleRequest } = await import("../memory-retrieval/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/memory-retrieval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer service",
        },
        body: JSON.stringify({ query: "anything" }),
      }),
    );
    assertEquals(res.status, 400);
    const payload = await res.json();
    assert(String(payload.error).includes("tenant_id"));
  } finally {
    stub.restore();
    restoreEnv();
  }
});

Deno.test("memory-retrieval passes an internal caller's tenant to both bank RPCs", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    OPENAI_API_KEY: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_API_TOKEN: undefined,
  });
  const stub = stubSupabase(null);
  try {
    const { handleRequest } = await import("../memory-retrieval/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/memory-retrieval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer service",
        },
        body: JSON.stringify({ query: "solar pipeline", tenant_id: "jk-renewables" }),
      }),
    );
    assertEquals(res.status, 200);
    const payload = await res.json();
    assertEquals(payload.tenant_id, "jk-renewables");
    assert(stub.captured.rpcCalls.includes("match_memory_banks"), stub.captured.rpcCalls.join(","));
    assert(stub.captured.rpcCalls.includes("match_knowledge_base"), stub.captured.rpcCalls.join(","));
    assertEquals(stub.captured.tenantParam, "jk-renewables");
  } finally {
    stub.restore();
    restoreEnv();
  }
});

Deno.test("a user caller cannot spoof the tenant via the request body", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
    OPENAI_API_KEY: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
    CLOUDFLARE_API_TOKEN: undefined,
  });
  const stub = stubSupabase({ id: "u-1" });
  try {
    const token = jwt({
      sub: "u-1",
      app_metadata: { tenant_id: "unifirst" },
    });

    const { handleRequest } = await import("../memory-retrieval/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/memory-retrieval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // The body claims a different tenant. The token must win.
        body: JSON.stringify({ query: "prospect notes", tenant_id: "jk-renewables" }),
      }),
    );

    assert(res.status !== 401, `expected the verified user to be admitted, got ${res.status}`);
    const payload = await res.json();
    assertEquals(payload.tenant_id, "unifirst");
  } finally {
    stub.restore();
    restoreEnv();
  }
});
