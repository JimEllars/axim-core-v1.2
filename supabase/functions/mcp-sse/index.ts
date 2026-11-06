// supabase/functions/mcp-sse/index.ts
//
// The SSE half of the MCP surface. `cloudflare-workers/src/index.js` routes
// `/sse` and `/api/v1/mcp/sse` here; the directory did not exist, so both
// answered 404.
//
//   GET  /sse   open a stream, emit the `endpoint` event, keep it alive
//   POST /sse   JSON-RPC over POST (a client that mistook this for the
//               Streamable HTTP endpoint still gets a real answer)
//   DELETE /sse terminate. Sessions are signed tokens with no server state, so
//               there is nothing to revoke and this is 204 by design.
//
// The stream is bounded. Supabase Edge Functions cap wall-clock time, so an SSE
// connection cannot stay open indefinitely; this emits keepalive comments for
// `SSE_MAX_DURATION_MS` and then closes cleanly with a final `retry` hint so the
// client reconnects and receives a fresh session. Saying so in the stream beats
// a connection that dies mid-tool-call with no explanation.
//
// The session id is an HMAC-signed token (`_shared/mcpSession.ts`), not a row in
// a table: invocations are isolated, so there is no in-memory session to return
// to and no reason to add a table for one.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  authoriseMcpCaller,
  buildRpcContext,
  messageEndpoint,
  sessionSecret,
} from '../_shared/mcpServer.ts';
import { resolveMcpActor } from '../_shared/mcpAuthz.ts';
import { requestQuotaRejection } from '../_shared/mcpQuota.ts';
import { handleRpcPayload } from '../_shared/mcpProtocol.ts';
import { createSession, SessionSecretMissingError, subjectForCaller } from '../_shared/mcpSession.ts';
import { createDataAccess, type SupabaseLike } from '../_shared/mcpSupabase.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/** How long one SSE connection stays open before the client must reconnect. */
const SSE_MAX_DURATION_MS = 25_000;
/** Keepalive cadence; well inside the 60 s idle timeout most proxies apply. */
const SSE_KEEPALIVE_MS = 5_000;

const json = (payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });

/**
 * An SSE stream that announces the message endpoint, then sends keepalives until
 * its budget runs out. `cancel()` clears the interval so a client disconnect does
 * not leave a timer running inside the isolate.
 */
function openStream(endpoint: string): Response {
  const encoder = new TextEncoder();
  let interval: number | undefined;
  let timeout: number | undefined;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`event: endpoint\ndata: ${endpoint}\n\n`),
      );

      interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${new Date().toISOString()}\n\n`));
        } catch {
          // The stream was closed underneath us; stop the timers below.
          if (interval !== undefined) clearInterval(interval);
        }
      }, SSE_KEEPALIVE_MS);

      timeout = setTimeout(() => {
        if (interval !== undefined) clearInterval(interval);
        try {
          controller.enqueue(encoder.encode('retry: 1000\n\n'));
          controller.close();
        } catch {
          // Already closed.
        }
      }, SSE_MAX_DURATION_MS);
    },
    cancel() {
      if (interval !== undefined) clearInterval(interval);
      if (timeout !== undefined) clearTimeout(timeout);
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = req.method === 'POST' ? await req.text() : '';
    const auth = await authoriseMcpCaller({
      headers: req.headers,
      rawBody,
      env: Deno.env,
      verifyUser: async (token) => {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return null;
        return data.user.id;
      },
    });

    if (!auth.ok) {
      return json({ error: auth.reason }, auth.status);
    }

    // One budget per authenticated caller, shared with the other MCP routes
    // through the same in-isolate store. Keyed by subject, never by credential.
    const quota = requestQuotaRejection(auth.caller);
    if (quota) {
      return json(quota.body, quota.status, quota.headers);
    }

    if (req.method === 'DELETE') {
      // Stateless signed sessions: expiry is the revocation mechanism.
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method === 'POST') {
      const data = createDataAccess(supabaseAdmin as unknown as SupabaseLike);
      const context = buildRpcContext({
        caller: auth.caller,
        // Resolved inside the POST branch: the GET handshake and DELETE carry no
        // tool call, so they should not cost a `public.users` read.
        actor: await resolveMcpActor({ caller: auth.caller, data }),
        client: supabaseAdmin as unknown as SupabaseLike,
      });
      const handled = await handleRpcPayload(rawBody, context);
      if (handled.body === null) {
        return new Response(null, { status: handled.status, headers: corsHeaders });
      }
      return json(handled.body, handled.status);
    }

    if (req.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405);
    }

    // GET: the SSE handshake.
    let token: string;
    try {
      const created = await createSession({
        secret: sessionSecret(Deno.env),
        subject: subjectForCaller(auth.caller),
      });
      token = created.token;
    } catch (error) {
      if (error instanceof SessionSecretMissingError) {
        // Fail loudly rather than handing out a session that cannot be verified.
        return json({ error: error.message }, 503);
      }
      throw error;
    }

    const endpoint = `${messageEndpoint(req.url, Deno.env)}?sessionId=${encodeURIComponent(token)}`;
    return openStream(endpoint);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`mcp-sse: ${message}`);
    return json({ error: message }, 500);
  }
});
