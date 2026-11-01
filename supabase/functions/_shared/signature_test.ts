/**
 * Tests for versioned request signing with a date-keyed dual-accept window.
 *
 * These are the properties that make the rollout safe:
 *   - v2 signatures are bound to the timestamp and expire
 *   - legacy body-only signatures keep working until the sunset date
 *   - the sunset closes the window without a coordinated deploy
 *   - a replayed v2 request is refused once it is older than 5 minutes
 *
 * Run: deno test --config /tmp/deno-fn.json --allow-env _shared/signature_test.ts
 */
import { assertEquals, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  DEFAULT_LEGACY_SUNSET,
  SIGNATURE_MAX_SKEW_SECONDS,
  verifySignedRequest,
} from "./edgeAuth.ts";

const SECRET = "shared-secret";
const BODY = JSON.stringify({ app_id: "speedreport", event: "ping" });

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function v2Headers(signature: string, timestamp: number): Headers {
  return new Headers({
    "X-Axim-Signature-Version": "2",
    "X-Axim-Timestamp": String(timestamp),
    "X-Axim-Signature": `sha256=${signature}`,
  });
}

const NOW = Date.parse("2026-11-01T12:00:00Z");
const nowSeconds = Math.floor(NOW / 1000);

Deno.test("v2: a fresh timestamped signature is accepted", async () => {
  const ts = nowSeconds;
  const signature = await hmacHex(SECRET, `${ts}.${BODY}`);
  const result = await verifySignedRequest({
    headers: v2Headers(signature, ts),
    rawBody: BODY,
    secret: SECRET,
    nowMs: NOW,
  });
  assertEquals(result.ok, true);
  assertEquals(result.mode, "v2");
});

Deno.test("v2: a replayed request older than the window is refused", async () => {
  const ts = nowSeconds - (SIGNATURE_MAX_SKEW_SECONDS + 1);
  const signature = await hmacHex(SECRET, `${ts}.${BODY}`);
  const result = await verifySignedRequest({
    headers: v2Headers(signature, ts),
    rawBody: BODY,
    secret: SECRET,
    nowMs: NOW,
  });
  assertEquals(result.ok, false);
  assert(String(result.reason).includes("window"), result.reason);
});

Deno.test("v2: the timestamp is part of the signed material (cannot be re-dated)", async () => {
  // Signature made over the original timestamp, then the header is moved
  // forward to look fresh. Because the timestamp is signed, this must fail.
  const originalTs = nowSeconds - 3600;
  const signature = await hmacHex(SECRET, `${originalTs}.${BODY}`);
  const result = await verifySignedRequest({
    headers: v2Headers(signature, nowSeconds),
    rawBody: BODY,
    secret: SECRET,
    nowMs: NOW,
  });
  assertEquals(result.ok, false);
  assert(String(result.reason).includes("mismatch"), result.reason);
});

Deno.test("v2: a body-only signature replayed under the v2 header is refused", async () => {
  const legacySig = await hmacHex(SECRET, BODY);
  const result = await verifySignedRequest({
    headers: v2Headers(legacySig, nowSeconds),
    rawBody: BODY,
    secret: SECRET,
    nowMs: NOW,
  });
  assertEquals(result.ok, false);
});

Deno.test("v2: missing timestamp is refused", async () => {
  const signature = await hmacHex(SECRET, BODY);
  const headers = new Headers({
    "X-Axim-Signature-Version": "2",
    "X-Axim-Signature": signature,
  });
  const result = await verifySignedRequest({
    headers, rawBody: BODY, secret: SECRET, nowMs: NOW,
  });
  assertEquals(result.ok, false);
  assertEquals(result.mode, "v2");
});

Deno.test("legacy: a body-only signature is accepted before the sunset", async () => {
  const signature = await hmacHex(SECRET, BODY);
  const result = await verifySignedRequest({
    headers: new Headers({ "X-Axim-Signature": `sha256=${signature}` }),
    rawBody: BODY,
    secret: SECRET,
    nowMs: NOW, // before DEFAULT_LEGACY_SUNSET
  });
  assertEquals(result.ok, true);
  assertEquals(result.mode, "legacy");
});

Deno.test("legacy: the same signature is refused after the sunset", async () => {
  const signature = await hmacHex(SECRET, BODY);
  const afterSunset = Date.parse(DEFAULT_LEGACY_SUNSET) + 1000;
  const result = await verifySignedRequest({
    headers: new Headers({ "X-Axim-Signature": signature }),
    rawBody: BODY,
    secret: SECRET,
    nowMs: afterSunset,
  });
  assertEquals(result.ok, false);
  assertEquals(result.mode, "legacy");
  assert(String(result.reason).includes("retired"), result.reason);
});

Deno.test("legacy: a stale timestamp is honoured when supplied", async () => {
  const staleTs = nowSeconds - 10_000;
  const signature = await hmacHex(SECRET, BODY);
  const result = await verifySignedRequest({
    headers: new Headers({
      "X-Axim-Signature": signature,
      "X-Axim-Timestamp": String(staleTs),
    }),
    rawBody: BODY,
    secret: SECRET,
    nowMs: NOW,
  });
  assertEquals(result.ok, false);
});

Deno.test("both forms reject a wrong secret", async () => {
  const ts = nowSeconds;
  const sig = await hmacHex("wrong-secret", `${ts}.${BODY}`);
  const v2 = await verifySignedRequest({
    headers: v2Headers(sig, ts), rawBody: BODY, secret: SECRET, nowMs: NOW,
  });
  assertEquals(v2.ok, false);

  const legacySig = await hmacHex("wrong-secret", BODY);
  const legacy = await verifySignedRequest({
    headers: new Headers({ "X-Axim-Signature": legacySig }),
    rawBody: BODY, secret: SECRET, nowMs: NOW,
  });
  assertEquals(legacy.ok, false);
});

Deno.test("no configured secret fails closed", async () => {
  const result = await verifySignedRequest({
    headers: new Headers({ "X-Axim-Signature": "a".repeat(64) }),
    rawBody: BODY,
    secret: undefined,
    nowMs: NOW,
  });
  assertEquals(result.ok, false);
});

Deno.test("a malformed signature is refused without throwing", async () => {
  for (const value of ["", "not-hex", "sha256=", "sha256=zz"]) {
    const result = await verifySignedRequest({
      headers: new Headers({ "X-Axim-Signature": value }),
      rawBody: BODY,
      secret: SECRET,
      nowMs: NOW,
    });
    assertEquals(result.ok, false);
  }
});
