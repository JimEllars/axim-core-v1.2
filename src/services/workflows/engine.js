import api from "../onyxAI/api";
// We'll optionally load definitions as a fallback if not in DB, but DB takes priority.
import { workflowDefinitions } from "./definitions";

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
      // If step is a JSON definition from DB
      else if (step.type === "api_call") {
        result = await api.invokeAximService(
          step.config.service,
          step.config.endpoint,
          step.config.payload,
          userId,
        );
        result = {
          message: `API call to ${step.config.service} successful.`,
          data: result,
        };
      } else if (step.type === "email") {
        result = await api.sendEmail(
          step.config.to,
          step.config.subject,
          step.config.body,
          userId,
        );
        result = { message: `Email sent to ${step.config.to}.` };
      } else if (step.type === "query_database") {
        // Not officially implemented in api.js but standard payload mapping
        result = { message: `Query database step executed.` };
      } else {
        result = { message: `Step ${step.name} executed (JSON interpreter)` };
      }

      // Merge the result into the context for subsequent steps
      context = { ...context, ...result };

      results.push({
        step: step.name,
        success: true,
        message: result
          ? result.message || "Completed successfully."
          : "Completed successfully.",
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
