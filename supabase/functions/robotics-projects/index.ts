// supabase/functions/robotics-projects/index.ts
//
// `cloudflare-workers/src/index.js` has proxied `/api/v1/robotics/projects`
// here since the robotics schema landed, and the function did not exist — the
// route answered Supabase's 404. This is the function behind that route.
//
// GET  ?id=<uuid>&limit=<n>   list projects (optionally one)
// POST { name, robot_class, target_specs? }   create a project
//
// All the logic lives in `_shared/robotics.ts` so it is unit tested without a
// Deno runtime; this file is wiring plus HTTP status mapping.

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
  createProject,
  listProjects,
  validateCreateProject,
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
      const projectId = url.searchParams.get('id');
      const limitParam = Number(url.searchParams.get('limit'));
      const projects = await listProjects(deps(), {
        projectId,
        limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
      });
      return json({ projects, count: projects.length });
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

      const validated = validateCreateProject(body);
      if (!validated.ok) return json({ error: validated.error }, 400);

      const project = await createProject(validated.value, deps());
      return json({ project }, 201);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`robotics-projects: ${message}`);
    return json({ error: message }, 500);
  }
});
