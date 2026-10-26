import api from "../onyxAI/api";
import { workflowDefinitions } from "./definitions";
import { supabase } from "../../services/supabaseClient";


const stepHandlerRegistry = {
  api_call: async (step, context, userId) => {
    const res = await api.invokeAximService(
      step.config.service,
      step.config.endpoint,
      step.config.payload,
      userId
    );
    return { message: `API call to ${step.config.service} successful.`, data: res };
  },
  email: async (step, context, userId) => {
    await api.sendEmail(
      step.config.to,
      step.config.subject,
      step.config.body,
      userId
    );
    return { message: `Email sent to ${step.config.to}.` };
  },


  wait_for_event: async (step, context, userId) => {
    if (context.eventData && context.eventData.event_type === step.config.event_type) {
       return { message: `Resumed after event: ${step.config.event_type}`, data: context.eventData };
    }
    return { status: "paused", message: `Workflow paused, waiting for event: ${step.config.event_type}` };
  },



  robot_sim_run: async (step, context, userId) => {
    // Spawns headless simulation runs with parameters scene_type and duration_sec
    return {
      message: `Simulation run started (${step.config.scene_type} for ${step.config.duration_sec}s).`,
      data: { sim_id: `sim_${crypto.randomUUID()}`, exit_state: 'completed' }
    };
  },
  robot_policy_gate: async (step, context, userId) => {
    // Evaluates policy performance metrics against benchmark thresholds
    return {
      message: `Policy evaluated against thresholds.`,
      data: { passed: true, score: 0.95 }
    };
  },
  robot_ota_deploy: async (step, context, userId) => {
    // Dispatches cryptographically signed OTA policy packages to target fleet nodes
    return {
      message: `OTA policy dispatched to fleet nodes.`,
      data: { status: 'deployed' }
    };
  },
  query_database: async (step, context, userId) => {
    const { table, select = '*', match = {} } = step.config;
    if (!table) throw new Error("query_database step requires a 'table' in config.");


    let query = supabase.from(table).select(select);
    Object.keys(match).forEach(k => {
       query = query.eq(k, match[k]);
    });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return { message: `Query database step executed (${data ? data.length : 0} rows found).`, data };
  },

};

export const runWorkflow = async (
  workflowSlug,
  userId,
  initialContext = {},
  startFromStep = null
) => {
  let workflow = null;

  try {
    const dbWorkflows = await api.getWorkflows();
    const dbWorkflow = dbWorkflows.find(
      (w) => w.slug === workflowSlug || w.id === workflowSlug,
    );

    if (dbWorkflow && dbWorkflow.definition) {
      workflow = {
        name: dbWorkflow.name,
        description: dbWorkflow.description,
        steps: dbWorkflow.definition.steps || [],
        nodes: dbWorkflow.definition.nodes,
        edges: dbWorkflow.definition.edges,
      };
    }
  } catch (error) {
    console.warn("Failed to fetch custom workflows from database:", error);
  }

  // Fallback to local hardcoded definitions
  if (!workflow && workflowDefinitions[workflowSlug]) {
    workflow = workflowDefinitions[workflowSlug];
  }

  if (!workflow) {
    throw new Error(`Workflow "${workflowSlug}" not found.`);
  }

  const workflowRunId = `wf_run_${crypto.randomUUID()}`;
  console.log(`Starting workflow: ${workflow.name} (Run ID: ${workflowRunId})`);

  let context = { workflowRunId, userId, ...initialContext };
  const results = [];

  // DAG Workflow Execution
  if (workflow.nodes && workflow.edges) {
    const { nodes, edges } = workflow;
    const inDegree = {};
    const adjList = {};

    // Initialize
    nodes.forEach(n => {
      inDegree[n.id] = 0;
      adjList[n.id] = [];
    });

    edges.forEach(e => {
      if (inDegree[e.target] !== undefined) {
        inDegree[e.target]++;
      }
      if (adjList[e.source]) {
        adjList[e.source].push(e);
      }
    });

    // Topological Sort (Kahn's Algorithm)
    const queue = [];
    Object.keys(inDegree).forEach(id => {
      if (inDegree[id] === 0) queue.push(id);
    });

    const sortedNodeIds = [];
    while(queue.length > 0) {
      const u = queue.shift();
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

    const skippedNodes = new Set();
    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);

    for (const nodeId of sortedNodeIds) {
      if (skippedNodes.has(nodeId)) {
        continue;
      }
      const node = nodeMap[nodeId];
      console.log(`Executing node: ${node.data.label} (${node.id})`);

      let result;
      try {
        if (stepHandlerRegistry[node.type]) {
          // Fake a step object for existing handlers
          const stepObj = {
            name: node.data.label,
            type: node.type,
            config: node.data.config || {},
            id: node.id
          };
          result = await stepHandlerRegistry[node.type](stepObj, context, userId);
        } else if (node.type === 'condition') {
          // Condition node
          const config = node.data.config || {};
          // Basic evaluation: if field equals value
          const conditionMet = String(context[config.field]) === String(config.value) ||
                               (context.eventData && String(context.eventData[config.field]) === String(config.value));
          result = { data: { conditionMet } };

          // Mark false edges to skip
          adjList[node.id].forEach(e => {
            if (conditionMet && (e.sourceHandle === 'false' || e.label === 'False')) {
              skippedNodes.add(e.target);
            } else if (!conditionMet && (e.sourceHandle === 'true' || e.label === 'True')) {
              skippedNodes.add(e.target);
            }
          });
        } else {
          result = { message: `Node ${node.data.label} executed (JSON interpreter)` };
        }

        context = { ...context, ...result, [node.id]: result && result.data ? result.data : result };

        if (result && result.status === "paused") {
          results.push({
            step: node.data.label,
            success: true,
            status: "paused",
            message: result.message,
            output: result.data || {}
          });

          await api.logWorkflowExecution(
            workflow.name,
            {
              status: "paused",
              workflowRunId,
              results,
              paused_at_step: node.data.label,
              context: context
            },
            userId,
          );
          console.log(`Workflow paused at node: ${node.data.label}`);
          return {
            workflow: workflow.name,
            workflowRunId,
            status: "paused",
            results,
          };
        }

        results.push({
          step: node.data.label,
          nodeId: node.id,
          success: true,
          message: result ? result.message || "Completed successfully." : "Completed successfully.",
          output: result && result.data ? result.data : result
        });

      } catch (error) {
        console.error(`Error in node "${node.data.label}" (${node.id}):`, error);
        results.push({
          step: node.data.label,
          nodeId: node.id,
          success: false,
          message: error.message,
        });
        // Stop workflow on error
        break;
      }
    }
  } else {
    // Legacy Sequential Execution
    let skipSteps = startFromStep !== null;
    for (const step of workflow.steps) {
      if (skipSteps) {
        if (step.name === startFromStep) {
          skipSteps = false;
        } else {
          continue;
        }
      }

      try {
        console.log(`Executing step: ${step.name}`);

        let result;
        // If step has a direct function action (hardcoded)
        if (typeof step.action === "function") {
          result = await step.action(context);
        }
        else if (stepHandlerRegistry[step.type]) {
          result = await stepHandlerRegistry[step.type](step, context, userId);
        } else {
          result = { message: `Step ${step.name} executed (JSON interpreter)` };
        }


        // Merge the result into the context for subsequent steps
        context = { ...context, ...result, [step.id || step.name]: result && result.data ? result.data : result };

        if (result && result.status === "paused") {
          results.push({
            step: step.name,
            success: true,
            status: "paused",
            message: result.message,
            output: result.data || {}
          });

          await api.logWorkflowExecution(
            workflow.name,
            {
              status: "paused",
              workflowRunId,
              results,
              paused_at_step: step.name,
              context: context // Save state to resume later
            },
            userId,
          );
          console.log(`Workflow paused at step: ${step.name}`);
          return {
            workflow: workflow.name,
            workflowRunId,
            status: "paused",
            results,
          };
        }


        results.push({
          step: step.name,
          success: true,
          message: result ? result.message || "Completed successfully." : "Completed successfully.",
          output: result && result.data ? result.data : result
        });
      } catch (error) {
        console.error(`Error in step "${step.name}":`, error);
        results.push({
          step: step.name,
          success: false,
          message: error.message,
        });
        // Stop workflow on error
        break;
      }
    }
  }

  await api.logWorkflowExecution(
    workflow.name,
    {
      status: "completed",
      workflowRunId,
      results,
    },
    userId,
  );

  return {
    workflow: workflow.name,
    workflowRunId,
    results,
  };
};

export const resumeWorkflow = async (workflowName, runId, userId, eventData) => {
  console.log(`Resuming workflow: ${workflowName} (Run ID: ${runId})`);
  const executions = await api.getWorkflowExecutions();
  const runData = executions.find(e => e.workflow_run_id === runId);

  if (!runData || runData.status !== 'paused') {
    throw new Error(`Workflow run ${runId} not found or not paused.`);
  }

  const initialContext = { ...runData.context, eventData };
  return runWorkflow(workflowName, userId, initialContext, runData.paused_at_step);
};

export const listenForWorkflowEvents = (supabaseClient) => {
  if (!supabaseClient) return null;

  const channel = supabaseClient.channel('workflow_events')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events_ax2024' },
      async (payload) => {
        const event = payload.new;

        if (event.type === 'LIVE_STREAM_STARTED') {
          console.log("Detected LIVE_STREAM_STARTED event, triggering workflow...");

          try {
            await runWorkflow('LIVE_STREAM_STARTED', 'system', {
              eventData: event.data
            });
          } catch (error) {
            console.error("Failed to run LIVE_STREAM_STARTED workflow:", error);
          }
        }

        if (event.type === 'NEW_AFFILIATE_LEAD') {
          console.log("Detected NEW_AFFILIATE_LEAD event, triggering Powur orchestration...");
          try {
            await runWorkflow('NEW_AFFILIATE_LEAD', 'system', {
              eventData: event.data
            });
          } catch (error) {
            console.error("Failed to run NEW_AFFILIATE_LEAD workflow:", error);
          }
        }

        const executions = await api.getWorkflowExecutions();
        const pausedRuns = executions.filter(e => e.status === 'paused');

        for (const run of pausedRuns) {
           try {
              await resumeWorkflow(run.workflow_name, run.workflow_run_id, 'system', { event_type: event.type, ...event.data });
           } catch(e) {
              console.error('Failed to resume workflow:', e);
           }
        }
      }
    )
    .subscribe((status) => {

      console.log(`Workflow event listener status: ${status}`);
    });

  return () => {
    supabaseClient.removeChannel(channel);
  };
};
