// supabase/functions/robotics-sim-drainer/index.ts
//
// The consumer that `robot_sim_run` action nodes never had.
//
// `trigger-workflow` queues a `robot_simulation_runs` row with
// `status = 'queued'` and returns. Until this function existed nothing read that
// queue, so every simulation ever requested by a workflow stayed queued for
// ever.
//
//   GET  -> queue depth (queued / running / oldest queued age). Never claims.
//   POST { limit?: 1..25 } -> claim up to `limit` queued runs and dispatch each
//                             to ROBOTICS_SIM_ENDPOINT, recording the outcome.
//
// Internal callers only: a service key, or an HMAC-signed relay. Cron and
// `job-processor` are the intended callers. `verify_jwt = false` in
// supabase/config.toml so the signed-relay form is reachable; every other
// caller is refused by `authorizeQueueDrain`.
//
// With no simulator configured the POST answers 503 and claims nothing. Marking
// a run 'failed' because an operator has not set an env var would destroy queued
// work to report a configuration gap, and would record a failure for work that
// never started.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { assertPublicUrl } from '../_shared/ssrf.ts';
import {
  authorizeQueueDrain,
  classifyEdgeCaller,
  classifyDepsFromEnv,
} from '../_shared/edgeCaller.ts';
import {
  SimulatorNotConfiguredError,
  drainSimulationQueue,
  simulationQueueStats,
  validateDrainRequest,
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

const simEndpoint = Deno.env.get('ROBOTICS_SIM_ENDPOINT') ?? '';
const simTimeoutMs = Number(Deno.env.get('ROBOTICS_SIM_TIMEOUT_MS'));

const deps = (): RoboticsDeps => ({
  supabase: supabaseAdmin as unknown as RoboticsDeps['supabase'],
  fetchImpl: fetch,
  assertPublicUrl,
  now: () => Date.now(),
  simEndpoint: simEndpoint.trim() === '' ? undefined : simEndpoint.trim(),
  simTimeoutMs: Number.isFinite(simTimeoutMs) && simTimeoutMs > 0 ? simTimeoutMs : undefined,
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();

    const caller = await classifyEdgeCaller(req.headers, rawBody, {
      ...classifyDepsFromEnv(Deno.env),
      verifyUser: async (token) => {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return null;
        return data.user.id;
      },
    });

    if (caller.rejection) {
      console.warn(`robotics-sim-drainer: signature refused (${caller.rejection})`);
    }

    const decision = authorizeQueueDrain(caller);
    if (!decision.ok) return json({ error: decision.reason }, decision.status);

    if (req.method === 'GET') {
      const stats = await simulationQueueStats(deps());
      return json({ ...stats, simulator_configured: Boolean(deps().simEndpoint) });
    }

    if (req.method === 'POST') {
      let body: unknown;
      try {
        body = JSON.parse(rawBody || '{}');
      } catch {
        return json({ error: 'request body must be valid JSON' }, 400);
      }

      const validated = validateDrainRequest(body);
      if (!validated.ok) return json({ error: validated.error }, 400);

      const outcome = await drainSimulationQueue(validated.value.limit, deps());
      console.log(
        `robotics-sim-drainer: claimed ${outcome.claimed}, completed ${outcome.completed}, failed ${outcome.failed}`,
      );
      return json(outcome);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (error) {
    if (error instanceof SimulatorNotConfiguredError) {
      // Defensive: `simulationQueueStats` is what tells the operator how much is
      // waiting, so the 503 carries the backlog too.
      let stats: unknown = null;
      try {
        stats = await simulationQueueStats(deps());
      } catch {
        /* the 503 is still the right answer without it */
      }
      return json({ error: error.message, queue: stats }, 503);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`robotics-sim-drainer: ${message}`);
    return json({ error: message }, 500);
  }
});
