const fs = require('fs');
const file = 'src/services/workflows/engine.js';
let code = fs.readFileSync(file, 'utf8');

const replaceStart = code.indexOf('export const runWorkflow = async (');
const replaceEnd = code.indexOf('export const resumeWorkflow = async (');

const correctCode = `export const runWorkflow = async (
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
    throw new Error(\`Workflow "\${workflowSlug}" not found.\`);
  }

  const workflowRunId = \`wf_run_\${crypto.randomUUID()}\`;
  console.log(\`Starting workflow: \${workflow.name} (Run ID: \${workflowRunId})\`);

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
      console.log(\`Executing node: \${node.data.label} (\${node.id})\`);

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
            const edgeLabel = e.label || (e.data && e.data.label);
            if (conditionMet && edgeLabel === 'False') {
              skippedNodes.add(e.target);
            } else if (!conditionMet && edgeLabel === 'True') {
              skippedNodes.add(e.target);
            }
          });
        } else {
          result = { message: \`Node \${node.data.label} executed (JSON interpreter)\` };
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
          console.log(\`Workflow paused at node: \${node.data.label}\`);
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
        console.error(\`Error in node "\${node.data.label}" (\${node.id}):\`, error);
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
        console.log(\`Executing step: \${step.name}\`);

        let result;
        // If step has a direct function action (hardcoded)
        if (typeof step.action === "function") {
          result = await step.action(context);
        }
        else if (stepHandlerRegistry[step.type]) {
          result = await stepHandlerRegistry[step.type](step, context, userId);
        } else {
          result = { message: \`Step \${step.name} executed (JSON interpreter)\` };
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
          console.log(\`Workflow paused at step: \${step.name}\`);
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
        console.error(\`Error in step "\${step.name}":\`, error);
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

`;

code = code.substring(0, replaceStart) + correctCode + code.substring(replaceEnd);
fs.writeFileSync(file, code);
