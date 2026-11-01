import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { EmailDispatchManager } from '../_shared/EmailDispatchManager.ts';
import { assertPublicUrl } from '../_shared/ssrf.ts';
import { resolveWorkflowCaller, resolveActingUserId, coerceUuidOrNull } from '../_shared/workflowAuth.ts';
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
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
    // This function holds a service-role client. Before this guard existed it
    // accepted anonymous POSTs, i.e. anyone could run any workflow and write to
    // any table it touches.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const caller = await resolveWorkflowCaller({
      authorization: req.headers.get('Authorization') ?? req.headers.get('authorization'),
      signature: req.headers.get('X-Axim-Signature') ?? req.headers.get('x-axim-signature'),
      timestamp: req.headers.get('X-Axim-Timestamp') ?? req.headers.get('x-axim-timestamp'),
      rawBody: rawBodyText,
      internalKey: Deno.env.get('AXIM_INTERNAL_KEY') ?? null,
      // Machine callers: sibling edge functions (job-processor,
      // universal-dispatcher) authenticate with the service-role key, pg_cron
      // and satellites use AXIM_SERVICE_KEY / AXIM_INTERNAL_KEY.
      serviceKeys: [
        { key: Deno.env.get('AXIM_INTERNAL_KEY'), via: 'internal_key' },
        { key: Deno.env.get('AXIM_SERVICE_KEY'), via: 'service_key' },
        { key: SUPABASE_SERVICE_ROLE_KEY, via: 'service_role_key' },
      ],
      nowSeconds,
      getUser: async (token: string) => {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) return null;
        return { id: data.user.id };
      },
    });

    if (!caller) {
      return json({ error: 'Unauthorized' }, 401);
    }

    let body: Record<string, any>;
    try {
      body = rawBodyText ? JSON.parse(rawBodyText) : {};
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const acting = resolveActingUserId(caller, body.userId);
    if (acting.error) {
      return json({ error: acting.error }, 403);
    }
    const userId = acting.userId;

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
                 user_id: body.userId || null
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
    console.log(`Starting workflow: ${workflow.name} (Run ID: ${workflowRunId}, via: ${caller.via})`);

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
        authenticated_via: caller.via,
      }, 500);
    }

    return json({
      success: true,
      status,
      workflowRunId,
      duration_ms: durationMs,
      results: nodeExecutionResults,
      execution_logged: !insertError,
      authenticated_via: caller.via,
    });
  } catch (error: any) {
    console.error('Trigger Workflow Error:', error);
    return json({ error: error.message }, 500);
  }
});
