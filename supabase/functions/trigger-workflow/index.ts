import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { keysFromEnv, resolveCaller, verifySignedRequest } from '../_shared/edgeAuth.ts';
import { authorizeTrigger, coerceUuidOrNull } from '../_shared/workflowAuth.ts';
import { EmailDispatchManager } from '../_shared/EmailDispatchManager.ts';
import { assertPublicUrl } from '../_shared/ssrf.ts';
import {
  deriveExecutionStatus,
  executeActionNode,
  resolveActionType,
  type ActionDeps,
  type NodeResult,
} from '../_shared/workflowActions.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function buildActionDeps(): ActionDeps {
  const emailItApiKey = Deno.env.get('EMAILIT_API_KEY') ?? '';
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const senderDomain = Deno.env.get('EMAILIT_SENDER_DOMAIN') ?? '';
  const dispatcher = new EmailDispatchManager(emailItApiKey, resendApiKey);

  return {
    supabase: supabaseAdmin as unknown as ActionDeps['supabase'],
    supabaseUrl: SUPABASE_URL,
    assertPublicUrl,
    fetchImpl: fetch,
    now: () => Date.now(),
    sendEmail: async (message) => {
      if (!emailItApiKey || !senderDomain) {
        throw new Error(
          'Email dispatch is not configured (EMAILIT_API_KEY / EMAILIT_SENDER_DOMAIN missing)',
        );
      }
      const result = await dispatcher.send({
        from: message.from ?? `missioncontrol@${senderDomain}`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { success: Boolean(result?.success), messageId: result?.messageId };
    },
  };
}

/**
 * Classify the caller and record how they authenticated.
 *
 * Returns null when the request is anonymous or when a signature was presented
 * and did not verify. Signed requests are treated as internal callers: the HMAC
 * over the raw body with `AXIM_INTERNAL_KEY` is the machine credential.
 */
async function classifyCaller(
  headers: Headers,
  rawBody: string,
): Promise<{ caller: { kind: 'internal' | 'user' | 'anonymous'; userId: string | null }; via: string } | null> {
  const presentedSignature = headers.get('X-Axim-Signature') ?? headers.get('x-axim-signature');

  if (presentedSignature) {
    const verdict = await verifySignedRequest({
      headers,
      rawBody,
      secret: Deno.env.get('AXIM_INTERNAL_KEY') ?? undefined,
    });
    if (!verdict.ok) {
      console.warn(`trigger-workflow: rejected signature (${verdict.mode}): ${verdict.reason}`);
      return null;
    }
    return { caller: { kind: 'internal', userId: null }, via: `hmac:${verdict.mode}` };
  }

  const caller = await resolveCaller(
    headers,
    keysFromEnv(Deno.env),
    async (token) => {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) return null;
      return data.user.id;
    },
  );

  if (caller.kind === 'anonymous') return null;

  return {
    caller,
    via: caller.kind === 'internal' ? 'internal_key' : 'user_jwt',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // The raw body is read once: it is both the JSON payload and the exact byte
    // sequence an HMAC signature is computed over. Calling req.json() directly
    // would leave nothing to verify against.
    const rawBodyText = await req.text();

    // --- Authentication ------------------------------------------------------
    // `verify_jwt = false` in supabase/config.toml, so the platform checks
    // nothing. This function holds a service-role client, so it has to decide
    // for itself. Three accepted forms, in this order:
    //
    //   1. Signed relay: X-Axim-Signature (+ X-Axim-Timestamp) over the raw
    //      body, verified by `edgeAuth.verifySignedRequest` under the v2 /
    //      legacy dual-accept policy. A signature header that is *present* must
    //      verify — a bad one is terminal, never a downgrade to form 2 or 3.
    //   2. Service credential as a bearer token (`resolveCaller`).
    //   3. Verified Supabase JWT from the dashboard (`resolveCaller`).
    const via = await classifyCaller(req.headers, rawBodyText);

    if (!via) {
      return json(
        {
          error: 'Unauthorized',
          reason: 'authentication required: verified user token, internal service key, or a valid X-Axim-Signature',
        },
        401,
      );
    }

    const caller = via.caller;

    let body: Record<string, any>;
    try {
      body = rawBodyText ? JSON.parse(rawBodyText) : {};
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    // Identity is decided by the caller's credentials, never by the body alone.
    const decision = authorizeTrigger(caller, body.userId);
    if (!decision.ok) {
      return json({ error: 'Forbidden', reason: decision.reason }, decision.status);
    }
    const userId = decision.actorId;
    const authenticatedVia = via.via;

    const { workflowId, workflowSlug, context = {} } = body;

    let query = supabaseAdmin.from('workflows_ax2024').select('*');
    if (workflowId) {
      query = query.eq('id', workflowId);
    } else if (workflowSlug) {
      query = query.eq('slug', workflowSlug);
    } else if (body.workflow) {
      // support legacy payload
      query = query.or(`id.eq.${body.workflow},slug.eq.${body.workflow},name.eq.${body.workflow}`);
    } else {
      return json({ error: 'Missing workflowId or workflowSlug' }, 400);
    }

    const { data: workflow, error: wfError } = await query.single();

    if (wfError || !workflow) {
       console.error("Workflow fetch error:", wfError);
       // Fallback for hardcoded system workflows if not in DB
       if (body.workflow === 'infrastructure-monitor' || body.meta?.event_type === 'lead.created' || body.type === 'INSERT') {
           // Handle legacy hardcoded logic
           if (body.meta?.event_type === 'lead.created') {
             await supabaseAdmin.from('events_ax2024').insert({
                 type: 'workflow_executed',
                 data: { workflow: 'lead.created', trigger: 'webhook' }
             });
             return json({ success: true, message: 'lead.created workflow triggered.' });
           }
           if (body.workflow === 'infrastructure-monitor') {
             await supabaseAdmin.from('events_ax2024').insert({
                 type: 'workflow_executed',
                 data: { workflow: 'infrastructure-monitor', trigger: 'telemetry_anomaly' },
                 user_id: userId || null
             });
             await supabaseAdmin.from('tasks').insert({
                 title: 'Review Infrastructure Incident Report',
                 description: 'Anomaly detected by telemetry archiver. Spike in 502 gateway errors or GCP fallback events.',
                 status: 'pending', priority: 'high', project_id: null
             });
             return json({ success: true, message: 'Infrastructure monitor triggered.' });
           }
           if (body.type === 'INSERT' && body.table === 'users' && body.schema === 'auth') {
              const uId = body.record.id;
              await supabaseAdmin.from('events_ax2024').insert({
                 type: 'workflow_executed',
                 data: { workflow: 'New Partner Onboarding', trigger: 'auth.users.INSERT' },
                 user_id: uId
              });
              return json({ success: true });
           }
       }

       return json({ error: 'Workflow not found' }, 404);
    }

    const workflowRunId = `wf_run_${crypto.randomUUID()}`;
    const startedAt = Date.now();
    console.log(`Starting workflow: ${workflow.name} (Run ID: ${workflowRunId}, via: ${authenticatedVia})`);

    let finalContext: Record<string, any> = { workflowRunId, userId, ...context };
    const nodeExecutionResults: NodeResult[] = [];
    let aborted = false;
    let abortReason: string | null = null;

    const definition = workflow.definition;
    const hasGraph = definition && Array.isArray(definition.nodes) && Array.isArray(definition.edges);

    // A workflow with no steps is not a success. Rows created before the
    // `definition` column existed carry an empty graph, and the old runner would
    // have logged those runs as 'completed' without executing anything.
    if (!hasGraph || definition.nodes.length === 0) {
      return json({
        error: 'Workflow has no steps to execute',
        workflowId: workflow.id,
        workflowName: workflow.name,
      }, 400);
    }

    if (hasGraph) {
      const { nodes, edges } = definition;
      const inDegree: Record<string, number> = {};
      const adjList: Record<string, any[]> = {};

      nodes.forEach((n: any) => {
        inDegree[n.id] = 0;
        adjList[n.id] = [];
      });

      edges.forEach((e: any) => {
        if (inDegree[e.target] !== undefined) {
          inDegree[e.target]++;
        }
        if (adjList[e.source]) {
          adjList[e.source].push(e);
        }
      });

      const queue: string[] = [];
      Object.keys(inDegree).forEach(id => {
        if (inDegree[id] === 0) queue.push(id);
      });

      const sortedNodeIds: string[] = [];
      while(queue.length > 0) {
        const u = queue.shift()!;
        sortedNodeIds.push(u);

        adjList[u].forEach(e => {
          inDegree[e.target]--;
          if (inDegree[e.target] === 0) {
            queue.push(e.target);
          }
        });
      }

      if (sortedNodeIds.length !== nodes.length) {
        throw new Error("Workflow contains cyclic dependencies.");
      }

      const skippedNodes = new Set<string>();
      const nodeMap: Record<string, any> = {};
      nodes.forEach((n: any) => nodeMap[n.id] = n);

      const deps = buildActionDeps();

      for (const nodeId of sortedNodeIds) {
        if (skippedNodes.has(nodeId)) continue;

        const node = nodeMap[nodeId];
        const label = node.data?.label || node.id;
        console.log(`Executing node: ${label} (${node.id})`);

        try {
          let result: { message: string; data?: unknown };

          if (node.type === 'trigger') {
            result = { message: `Trigger ${label} activated`, data: { startTime: new Date().toISOString() } };
          } else if (node.type === 'action') {
            // Real dispatch. Throws for unsupported types and failed calls
            // instead of reporting a fabricated success.
            result = await executeActionNode(node, finalContext, deps);
          } else if (node.type === 'condition') {
            const config = node.data?.config || {};
            const conditionMet = String(finalContext[config.field]) === String(config.value) ||
                                 (finalContext.eventData && String(finalContext.eventData[config.field]) === String(config.value));
            result = { message: `Condition ${label}: ${conditionMet}`, data: { conditionMet } };

            adjList[node.id].forEach(e => {
              if (conditionMet && (e.sourceHandle === 'false' || e.label === 'False')) {
                skippedNodes.add(e.target);
              } else if (!conditionMet && (e.sourceHandle === 'true' || e.label === 'True')) {
                skippedNodes.add(e.target);
              }
            });
          } else {
            throw new Error(`Unknown node type "${node.type}"`);
          }

          finalContext = { ...finalContext, ...(result.data || {}), [node.id]: result.data ?? result };

          nodeExecutionResults.push({
             step: label,
             nodeId: node.id,
             actionType: resolveActionType(node),
             success: true,
             message: result.message,
             output: result.data ?? result,
          });
        } catch (err: any) {
          console.error(`Error in node "${label}":`, err);
          aborted = true;
          abortReason = err?.message ?? String(err);
          nodeExecutionResults.push({
             step: label,
             nodeId: node.id,
             actionType: resolveActionType(node),
             success: false,
             message: abortReason,
          });
          break; // Stop workflow on error
        }
      }
    }

    const status = deriveExecutionStatus(nodeExecutionResults, aborted);
    const durationMs = Date.now() - startedAt;

    const { error: insertError } = await supabaseAdmin.from('workflow_execution_logs').insert({
      workflow_id: workflow.id,
      workflow_run_id: workflowRunId,
      workflow_name: workflow.name,
      status,
      execution_context: finalContext,
      node_results: nodeExecutionResults,
      error_message: abortReason,
      duration_ms: durationMs,
      user_id: coerceUuidOrNull(userId)
    });

    if (insertError) {
      // Previously swallowed: the run was reported as completed even though no
      // audit row was written. Surface it as a response field the caller sees.
      console.error("Failed to log workflow execution:", insertError);
    }

    if (status !== 'completed') {
      return json({
        success: false,
        status,
        workflowRunId,
        error: abortReason ?? 'Workflow did not complete',
        results: nodeExecutionResults,
        execution_logged: !insertError,
        authenticated_via: authenticatedVia,
      }, 500);
    }

    return json({
      success: true,
      status,
      workflowRunId,
      duration_ms: durationMs,
      results: nodeExecutionResults,
      execution_logged: !insertError,
      authenticated_via: authenticatedVia,
    });
  } catch (error: any) {
    console.error('Trigger Workflow Error:', error);
    return json({ error: error.message }, 500);
  }
});
