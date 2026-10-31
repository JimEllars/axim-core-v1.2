/**
 * Runtime tests for the Core edge-function authentication hardening.
 *
 * Run with Deno, not vitest:
 *   deno test --config /tmp/deno-fn.json --allow-env supabase/functions/
 *
 * These execute the real handlers (they are exported for this reason) rather
 * than re-declaring the logic, and they stub `fetch` so no network is touched.
 */
import { assertEquals, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  isInternalServiceCall,
  keysFromEnv,
  resolveCaller,
  timingSafeEqual,
} from "./edgeAuth.ts";

const KEYS = { internalKey: "internal-key", serviceKey: "service-key" };

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

Deno.test("timingSafeEqual compares by value", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "ab"));
  assert(!timingSafeEqual("", "x"));
});

Deno.test("isInternalServiceCall accepts both header forms", () => {
  assert(isInternalServiceCall(headers({ "X-Axim-Internal-Service-Key": "internal-key" }), KEYS));
  assert(isInternalServiceCall(headers({ Authorization: "Bearer service-key" }), KEYS));
  // Scheme check is case-insensitive, as HTTP requires.
  assert(isInternalServiceCall(headers({ authorization: "bearer service-key" }), KEYS));
});

Deno.test("isInternalServiceCall rejects wrong or absent credentials", () => {
  assert(!isInternalServiceCall(headers({}), KEYS));
  assert(!isInternalServiceCall(headers({ "X-Axim-Internal-Service-Key": "nope" }), KEYS));
  assert(!isInternalServiceCall(headers({ Authorization: "Bearer nope" }), KEYS));
  // The old literal fallbacks must never authenticate.
  assert(!isInternalServiceCall(headers({ "X-Axim-Internal-Service-Key": "test_internal_key" }), KEYS));
  assert(!isInternalServiceCall(headers({ Authorization: "Bearer test1" }), KEYS));
});

Deno.test("isInternalServiceCall fails closed when no key is configured", () => {
  assert(!isInternalServiceCall(headers({ "X-Axim-Internal-Service-Key": "" }), {}));
  assert(!isInternalServiceCall(headers({ Authorization: "Bearer anything" }), {}));
});

Deno.test("resolveCaller classifies internal, user and anonymous", async () => {
  const internal = await resolveCaller(headers({ Authorization: "Bearer internal-key" }), KEYS);
  assertEquals(internal.kind, "internal");

  const user = await resolveCaller(
    headers({ Authorization: "Bearer good-token" }),
    KEYS,
    async (token) => (token === "good-token" ? "user-1" : null),
  );
  assertEquals(user.kind, "user");
  assertEquals(user.userId, "user-1");

  const anonymous = await resolveCaller(
    headers({ Authorization: "Bearer bad-token" }),
    KEYS,
    async () => null,
  );
  assertEquals(anonymous.kind, "anonymous");

  const none = await resolveCaller(headers({}), KEYS);
  assertEquals(none.kind, "anonymous");
});

Deno.test("keysFromEnv ignores empty values", () => {
  const env = {
    get: (k: string) => (k === "AXIM_INTERNAL_KEY" ? "" : k === "SUPABASE_SERVICE_ROLE_KEY" ? "svc" : undefined),
  };
  const keys = keysFromEnv(env);
  assertEquals(keys.internalKey, undefined);
  assertEquals(keys.serviceKey, "svc");
});

// ---------------------------------------------------------------------------
// Handler-level tests. `fetch` is stubbed so nothing leaves the process.
// ---------------------------------------------------------------------------

function stubFetch(body: unknown = {}, status = 200) {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    )) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
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

Deno.test("generate-embedding rejects an anonymous caller", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
  });
  const restoreFetch = stubFetch({});
  try {
    const { handleRequest } = await import("../generate-embedding/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/generate-embedding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: "poison the memory" }),
      }),
    );
    assertEquals(res.status, 401);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test("generate-embedding rejects a forged bearer token", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
  });
  // auth.getUser returns no user for this token.
  const restoreFetch = stubFetch({});
  try {
    const { handleRequest } = await import("../generate-embedding/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/generate-embedding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer forged",
        },
        body: JSON.stringify({ input: "x" }),
      }),
    );
    assertEquals(res.status, 401);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test("generate-embedding admits a service caller", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
    OPENAI_API_KEY: undefined,
    CF_ACCOUNT_ID: undefined,
    CF_API_TOKEN: undefined,
  });
  const restoreFetch = stubFetch({ id: "row-1" });
  try {
    const { handleRequest } = await import("../generate-embedding/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/generate-embedding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer service",
        },
        body: JSON.stringify({ input: "hello", user_id: "someone" }),
      }),
    );
    assert(res.status !== 401, `expected the service caller to be admitted, got ${res.status}`);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test("onyx-sentinel rejects an anonymous POST", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
  });
  const restoreFetch = stubFetch({});
  try {
    const { handleRequest } = await import("../onyx-sentinel/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/onyx-sentinel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: { status: "offline", id: "n1", app_name: "x" } }),
      }),
    );
    assertEquals(res.status, 401);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test("onyx-ui-stream rejects an anonymous subscriber", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
  });
  const restoreFetch = stubFetch({});
  try {
    const { handleRequest } = await import("../onyx-ui-stream/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/onyx-ui-stream", { method: "GET" }),
    );
    assertEquals(res.status, 401);
    // Rejected before the SSE stream is created: the body is a plain JSON error.
    assertEquals(res.headers.get("Content-Type"), "application/json");
    assertEquals(await res.json(), { error: "Unauthorized" });
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

Deno.test("memory-retrieval rejects the old literal fallback key", async () => {
  const restoreEnv = setEnv({
    SUPABASE_URL: "https://project.example",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    AXIM_INTERNAL_KEY: undefined,
    AXIM_SERVICE_KEY: undefined,
  });
  const restoreFetch = stubFetch({});
  try {
    const { handleRequest } = await import("../memory-retrieval/index.ts");
    const res = await handleRequest(
      new Request("https://edge.example/memory-retrieval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Axim-Internal-Service-Key": "test_internal_key",
        },
        body: JSON.stringify({ query: "anything" }),
      }),
    );
    assertEquals(res.status, 401);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});
