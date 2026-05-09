import api from "../onyxAI/api";
import { workflowDefinitions } from "./definitions";


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
    // Return a special status to pause the workflow execution
    return { status: "paused", message: `Workflow paused, waiting for event: ${step.config.event_type}` };
  },
  query_database: async (step, context, userId) => {
    return { message: `Query database step executed.` };
  }
};

export const runWorkflow = async (
  workflowSlug,
  userId,
  initialContext = {},
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

  for (const step of workflow.steps) {
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
      }
    )
    .subscribe((status) => {
      console.log(`Workflow event listener status: ${status}`);
    });

  return () => {
    supabaseClient.removeChannel(channel);
  };
};
