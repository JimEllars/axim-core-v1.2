// supabase/functions/robotics-emergency-stop/index.ts
//
// The function behind `/api/v1/robotics/fleet/emergency-stop`, previously a 404.
//
// POST { project_id } | { node_ids: [...] }  + optional { reason }
//
// This is the one robotics endpoint a machine caller needs, so it accepts both
// forms of non-human authentication: a service key, or an HMAC-signed relay
// (`X-Axim-Signature` over the raw body, v2 form requires `X-Axim-Timestamp`
// inside a 5 minute window). `verify_jwt = false` in supabase/config.toml is
// deliberate — the platform check would reject the signed-relay form — and is
// safe only because `classifyEdgeCaller` refuses everything anonymous.
//
// Stopping is the fail-safe direction: fleet rows are moved to
// `emergency_stop` before the audit rows are written, so a partial failure
// leaves robots stopped rather than moving.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { assertPublicUrl } from '../_shared/ssrf.ts';
import {
  authorizeRoboticsOperation,
  classifyEdgeCaller,
  classifyDepsFromEnv,
} from '../_shared/edgeCaller.ts';
import {
  emergencyStopFleet,
  validateEmergencyStop,
  type RoboticsDeps,
} from '../_shared/robotics.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const deps = (): RoboticsDeps => ({
  supabase: supabaseAdmin as unknown as RoboticsDeps['supabase'],
  fetchImpl: fetch,
  assertPublicUrl,
  now: () => Date.now(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  try {
    const rawBody = await req.text();

    const caller = await classifyEdgeCaller(req.headers, rawBody, {
      ...classifyDepsFromEnv(Deno.env),
      verifyUser: async (token) => {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return null;
        return data.user.id;
      },
    });

    if (caller.rejection) {
      console.warn(`robotics-emergency-stop: signature refused (${caller.rejection})`);
    }

    const decision = authorizeRoboticsOperation(caller, 'fleet_stop');
    if (!decision.ok) return json({ error: decision.reason }, decision.status);

    let body: unknown;
    try {
      body = JSON.parse(rawBody || '{}');
    } catch {
      return json({ error: 'request body must be valid JSON' }, 400);
    }

    const validated = validateEmergencyStop(body);
    if (!validated.ok) return json({ error: validated.error }, 400);

    const outcome = await emergencyStopFleet(
      validated.value,
      deps(),
      { kind: caller.kind, userId: caller.userId },
    );

    console.log(
      `robotics-emergency-stop: ${outcome.stopped} node(s) stopped (${outcome.scope}) by ${caller.via}`,
    );

    if (outcome.stopped === 0) {
      // Reported, not hidden: a stop request that matched nothing is a real
      // answer and the operator needs to see it rather than a cheerful 200.
      return json(
        {
          stopped: 0,
          scope: outcome.scope,
          warning: 'no fleet nodes matched the requested scope',
        },
        200,
      );
    }

    return json({
      stopped: outcome.stopped,
      scope: outcome.scope,
      fault_log_ids: outcome.fault_log_ids,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`robotics-emergency-stop: ${message}`);
    return json({ error: message }, 500);
  }
});
