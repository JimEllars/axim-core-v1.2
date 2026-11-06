// supabase/functions/mcp-router/index.ts
//
// `cloudflare-workers/src/index.js` has routed `/mcp`, `/api/v1/mcp` and the SSE
// pair here since the worker was written, and the directory did not exist — all
// six MCP routes returned Supabase's 404. This is the function behind them.
//
// Transports, honestly stated:
//
//   POST /mcp    JSON-RPC 2.0 (single message or batch), Streamable HTTP
//   GET  /mcp    discovery document: protocol version, capabilities, endpoints
//
// Authentication is `classifyEdgeCaller`: a verified user token, the internal
// service key, or a signed relay. Anonymous callers get 401 on every method,
// including discovery.
//
// Authorisation is per tool (`_shared/mcpAuthz.ts`): read tools are open to any
// authenticated caller, admin tools require `public.users.role = 'admin'` — the
// rule `hitl_audit_logs` already states for direct table access, and which the
// service-key client would otherwise bypass. One request quota applies to the
// caller after authentication (`_shared/mcpQuota.ts`).
//
// All protocol logic is in `_shared/mcpProtocol.ts` and all tool logic in
// `_shared/mcpTools.ts`, so both are unit tested under Node.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authoriseMcpCaller, buildRpcContext } from '../_shared/mcpServer.ts';
import { resolveMcpActor, visibleTools } from '../_shared/mcpAuthz.ts';
import { requestQuotaRejection } from '../_shared/mcpQuota.ts';
import {
  handleRpcPayload,
  MCP_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../_shared/mcpProtocol.ts';
import { listTools } from '../_shared/mcpTools.ts';
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
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

    // One budget per authenticated caller, across all six MCP routes. Charged
    // after authentication, so only a subject with an identity is ever counted
    // — and the key is that identity, never the credential.
    const quota = requestQuotaRejection(auth.caller);
    if (quota) {
      return json(quota.body, quota.status, quota.headers);
    }

    const data = createDataAccess(supabaseAdmin as unknown as SupabaseLike);
    const actor = await resolveMcpActor({ caller: auth.caller, data });

    if (req.method === 'GET') {
      return json({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        transport: 'streamable-http',
        authenticatedAs: auth.caller.via,
        // Only the tools this caller may actually call. A discovery document
        // that advertises admin tools to a non-admin is a map of what to try
        // next, not a feature list.
        tools: visibleTools(listTools(), actor).map((tool) => tool.name),
      });
    }

    const context = buildRpcContext({
      caller: auth.caller,
      actor,
      client: supabaseAdmin as unknown as SupabaseLike,
    });
    const handled = await handleRpcPayload(rawBody, context);

    if (handled.body === null) {
      return new Response(null, { status: handled.status, headers: corsHeaders });
    }
    return json(handled.body, handled.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`mcp-router: ${message}`);
    return json({ error: message }, 500);
  }
});
