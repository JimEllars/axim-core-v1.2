import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { workflowId, workflowSlug, context = {}, userId } = body;

    let query = supabaseAdmin.from('workflows_ax2024').select('*');
    if (workflowId) {
      query = query.eq('id', workflowId);
    } else if (workflowSlug) {
      query = query.eq('slug', workflowSlug);
    } else if (body.workflow) {
      // support legacy payload
      query = query.or(`id.eq.${body.workflow},slug.eq.${body.workflow},name.eq.${body.workflow}`);
    } else {
      return new Response(JSON.stringify({ error: 'Missing workflowId or workflowSlug' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
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
             return new Response(JSON.stringify({ success: true, message: 'lead.created workflow triggered.' }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
             });
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
             return new Response(JSON.stringify({ success: true, message: 'Infrastructure monitor triggered.' }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
             });
           }
           if (body.type === 'INSERT' && body.table === 'users' && body.schema === 'auth') {
              const uId = body.record.id;
              await supabaseAdmin.from('events_ax2024').insert({
                 type: 'workflow_executed',
                 data: { workflow: 'New Partner Onboarding', trigger: 'auth.users.INSERT' },
                 user_id: uId
              });
              return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
              });
           }
       }

       return new Response(JSON.stringify({ error: 'Workflow not found' }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         status: 404,
       });
    }

    const workflowRunId = `wf_run_${crypto.randomUUID()}`;
    console.log(`Starting workflow: ${workflow.name} (Run ID: ${workflowRunId})`);

    let finalContext = { workflowRunId, userId, ...context };
    const nodeExecutionResults: any[] = [];

    if (workflow.definition && workflow.definition.nodes && workflow.definition.edges) {
      const { nodes, edges } = workflow.definition;
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

      for (const nodeId of sortedNodeIds) {
        if (skippedNodes.has(nodeId)) continue;

        const node = nodeMap[nodeId];
        console.log(`Executing node: ${node.data?.label || node.id} (${node.id})`);

        let result: any;
        try {
          if (node.type === 'trigger') {
             result = { message: `Trigger ${node.data?.label} activated`, startTime: new Date().toISOString() };
          } else if (node.type === 'action') {
             // Mock execution logic for now inside edge function
             result = { message: `Action ${node.data?.label} executed` };
          } else if (node.type === 'condition') {
             const config = node.data?.config || {};
             const conditionMet = String(finalContext[config.field]) === String(config.value) ||
                                  (finalContext.eventData && String(finalContext.eventData[config.field]) === String(config.value));
             result = { data: { conditionMet } };

             adjList[node.id].forEach(e => {
               if (conditionMet && (e.sourceHandle === 'false' || e.label === 'False')) {
                 skippedNodes.add(e.target);
               } else if (!conditionMet && (e.sourceHandle === 'true' || e.label === 'True')) {
                 skippedNodes.add(e.target);
               }
             });
          } else {
             result = { message: `Node ${node.data?.label} executed` };
          }

          finalContext = { ...finalContext, ...result, [node.id]: result && result.data ? result.data : result };

          nodeExecutionResults.push({
             step: node.data?.label || node.id,
             nodeId: node.id,
             success: true,
             message: result?.message || "Completed successfully.",
             output: result?.data || result
          });
        } catch (err: any) {
          console.error(`Error in node "${node.data?.label || node.id}":`, err);
          nodeExecutionResults.push({
             step: node.data?.label || node.id,
             nodeId: node.id,
             success: false,
             message: err.message,
          });
          break; // Stop workflow on error
        }
      }
    }

    const { error: insertError } = await supabaseAdmin.from('workflow_execution_logs').insert({
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      status: 'completed',
      execution_context: finalContext,
      node_results: nodeExecutionResults,
      user_id: userId || null
    });

    if (insertError) {
      console.error("Failed to log workflow execution:", insertError);
    }

    return new Response(JSON.stringify({ success: true, workflowRunId, results: nodeExecutionResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Trigger Workflow Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
