// supabase/functions/mcp-message/index.ts
//
// The message endpoint the SSE handshake points a client at. The worker routes
// `/message` and `/api/v1/mcp/message` here; the directory did not exist, so both
// answered 404.
//
//   POST /message?sessionId=...   JSON-RPC 2.0 (single message or batch)
//
// Two checks run before a message is dispatched, and they are independent:
//
//   1. the session id must verify (signature, then expiry) — a client that never
//      completed the handshake has no session to present;
//   2. the caller must match the session's subject — a token minted for one
//      operator must not be replayable by another caller who happens to hold it,
//      and an internal-key session must not be usable from a user token.
//
// Sessions are HMAC-signed (`_shared/mcpSession.ts`) with AXIM_INTERNAL_KEY, so
// this validates with no shared state and no table.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authoriseMcpCaller, buildRpcContext, sessionSecret } from '../_shared/mcpServer.ts';
import { resolveMcpActor } from '../_shared/mcpAuthz.ts';
import { requestQuotaRejection } from '../_shared/mcpQuota.ts';
import { handleRpcPayload } from '../_shared/mcpProtocol.ts';
import { SessionSecretMissingError, subjectForCaller, verifySession } from '../_shared/mcpSession.ts';
import { createDataAccess, type SupabaseLike } from '../_shared/mcpSupabase.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });

function readSessionId(req: Request): string | null {
  const fromQuery = new URL(req.url).searchParams.get('sessionId');
  if (fromQuery && fromQuery.length > 0) return fromQuery;
  const fromHeader = req.headers.get('Mcp-Session-Id') ?? req.headers.get('mcp-session-id');
  return fromHeader && fromHeader.length > 0 ? fromHeader : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'DELETE') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  try {
    const rawBody = await req.text();
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

    const data = createDataAccess(supabaseAdmin as unknown as SupabaseLike);

    const sessionId = readSessionId(req);
    if (!sessionId) {
      return json({ error: 'missing sessionId: complete the SSE handshake on /functions/v1/mcp-sse first' }, 400);
    }

    try {
      const checked = await verifySession(sessionId, { secret: sessionSecret(Deno.env) });
      if (!checked.ok) {
        return json({ error: `session rejected: ${checked.reason}` }, 401);
      }

      const expectedSubject = subjectForCaller(auth.caller);
      if (checked.session.subject !== expectedSubject) {
        return json({ error: 'session is bound to a different caller' }, 403);
      }

      const context = buildRpcContext({
        caller: auth.caller,
        // Resolved here rather than before the session checks: an invalid
        // session should not cost a `public.users` read.
        actor: await resolveMcpActor({ caller: auth.caller, data }),
        client: supabaseAdmin as unknown as SupabaseLike,
      });
      const handled = await handleRpcPayload(rawBody, context);
      const headers = { 'Mcp-Session-Id': sessionId };

      if (handled.body === null) {
        return new Response(null, { status: handled.status, headers: { ...corsHeaders, ...headers } });
      }
      return json(handled.body, handled.status, headers);
    } catch (error) {
      if (error instanceof SessionSecretMissingError) {
        return json({ error: error.message }, 503);
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`mcp-message: ${message}`);
    return json({ error: message }, 500);
  }
});
