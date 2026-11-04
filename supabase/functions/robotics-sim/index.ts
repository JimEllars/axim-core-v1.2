// supabase/functions/robotics-sim/index.ts
//
// The function behind `/api/v1/robotics/sim`, which the edge worker has been
// proxying to a 404. It queues and reads headless simulation runs.
//
// GET  ?run_id=<uuid> | ?project_id=<uuid> | ?limit=<n>
// POST { project_id, duration_sec, scene_type?, params?, workflow_run_id? }
//
// Queuing only. The queue is *drained* by `robotics-sim-drainer`, because
// dispatch belongs to a machine caller on a schedule, not to the operator's
// request path.

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
  listSimulationRuns,
  projectExists,
  queueSimulationRun,
  validateSimRequest,
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

    if (req.method === 'GET') {
      const decision = authorizeRoboticsOperation(caller, 'read');
      if (!decision.ok) return json({ error: decision.reason }, decision.status);

      const url = new URL(req.url);
      const limitParam = Number(url.searchParams.get('limit'));
      const runs = await listSimulationRuns(deps(), {
        runId: url.searchParams.get('run_id'),
        projectId: url.searchParams.get('project_id'),
        limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
      });
      return json({ runs, count: runs.length });
    }

    if (req.method === 'POST') {
      const decision = authorizeRoboticsOperation(caller, 'write');
      if (!decision.ok) return json({ error: decision.reason }, decision.status);

      let body: unknown;
      try {
        body = JSON.parse(rawBody || '{}');
      } catch {
        return json({ error: 'request body must be valid JSON' }, 400);
      }

      const validated = validateSimRequest(body);
      if (!validated.ok) return json({ error: validated.error }, 400);

      // Without this the insert would surface Postgres's FK violation (23503) as
      // a 500 and read like an infrastructure fault rather than a bad request.
      const exists = await projectExists(validated.value.project_id, deps());
      if (!exists) {
        return json({ error: `no project with id ${validated.value.project_id}` }, 404);
      }

      const workflowRunId = (body as Record<string, unknown> | null)?.workflow_run_id;
      const run = await queueSimulationRun(validated.value, deps(), {
        workflowRunId: typeof workflowRunId === 'string' ? workflowRunId : null,
      });
      return json({ run, queued: true }, 202);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`robotics-sim: ${message}`);
    return json({ error: message }, 500);
  }
});
