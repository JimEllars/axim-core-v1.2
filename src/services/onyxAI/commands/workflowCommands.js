import { createCommand } from './commandFactory';
import { runWorkflow } from '../../workflows/engine';
import { workflowDefinitions } from '../../workflows/definitions';

export default [
  createCommand({
    name: 'listWorkflows',
    description: 'Lists all available automated workflows.',
    keywords: ['list workflows', 'show workflows', 'workflows'],
    category: 'Workflows',
    usage: 'list workflows',
    execute: async (args, context) => {
      let dbWorkflows = [];
      try {
        if (context && context.aximCore && context.aximCore.api) {
          dbWorkflows = await context.aximCore.api.getWorkflows();
        }
      } catch (error) {
        console.warn("Could not fetch workflows from database:", error);
      }

      const hardcoded = Object.entries(workflowDefinitions).map(([slug, def]) => {
        return `• **${def.name}** (\`${slug}\`)\n  ${def.description}`;
      });

      const custom = dbWorkflows.map(w => {
        return `• **${w.name}** (\`${w.slug}\`)\n  ${w.description || 'Custom database workflow'}`;
      });

      const allWorkflows = [...hardcoded, ...custom];

      return `### Available Workflows\n\n${allWorkflows.length > 0 ? allWorkflows.join('\n\n') : 'No workflows found.'}`;
    }
  }),
  createCommand({
    name: 'runWorkflow',
    aliases: ['execute_workflow'],
    description: 'Executes a specific automation workflow.',
    keywords: ['run workflow', 'start workflow', 'execute workflow', 'trigger', 'launch'],
    category: 'Workflows',
    usage: 'run workflow <slug> [json_arguments] OR trigger <slug>',
    entities: [
      { name: 'slug', required: true, prompt: 'Which workflow would you like to run?' }
    ],
    parse: (input) => {
      // Matches "run workflow my_slug", "trigger my_slug", "launch my_slug"
      // Also optionally captures remaining JSON string arguments
      // Also match "execute_workflow <slug>"
      const match = input.match(/(?:workflow|trigger|launch|execute_workflow)\s+([\w_-]+)(?:\s+(.+))?$/i);
      if (match) {
        return {
          slug: match[1].replace(/-/g, '_'), // Normalize dashes to underscores
          argsString: match[2] // Optional JSON string
        };
      }
      return {};
    },
    validate: (args) => {
      if (!args.slug) {
        throw new Error('Workflow slug is required.');
      }
      // If argsString is provided, it must be valid JSON
      if (args.argsString) {
        try {
          JSON.parse(args.argsString);
        } catch (e) {
          throw new Error('Arguments must be valid JSON.');
        }
      }
    },
    execute: async (args, context) => {
      const { slug, argsString } = args;
      const { userId } = context;

      let workflow = workflowDefinitions[slug];

      if (!workflow) {
        try {
          if (context.aximCore && context.aximCore.api) {
            const dbWorkflows = await context.aximCore.api.getWorkflows();
            workflow = dbWorkflows.find(w => w.slug === slug || w.id === slug || w.name === slug);
          }
        } catch (error) {
          console.warn("Could not fetch workflow from database:", error);
        }
      }

      if (!workflow) {
        return {
          type: 'error',
          message: `Workflow "${slug}" not found. Try "list workflows" to see available options.`
        };
      }

      let initialContext = {};
      if (argsString) {
        initialContext = JSON.parse(argsString);
      }

      try {
        // Provide immediate feedback? The command hub usually handles the promise.
        // runWorkflow executes synchronously in terms of the promise (awaits steps).
        const result = await runWorkflow(slug, userId, initialContext);

        // Format the output
        const stepsOutput = result.results.map(r =>
          `- **${r.step}**: ${r.success ? '✅' : '❌'} ${r.message}`
        ).join('\n');

        const successCount = result.results.filter(r => r.success).length;
        const totalCount = result.results.length;
        const overallStatus = successCount === totalCount ? 'Success' : 'Partial Failure';

        return {
            type: 'success',
            message: `Workflow **${result.workflow}** completed (${overallStatus}).\n\n${stepsOutput}`,
            data: result
        };

      } catch (error) {
        return {
          type: 'error',
          message: `Workflow execution failed: ${error.message}`
        };
      }
    }
  }),
  createCommand({
    name: 'scheduleTask',
    description: 'Schedules a recurring task or automation workflow using a cron expression.',
    keywords: ['schedule task', 'automate workflow', 'recurring task'],
    category: 'Workflows',
    usage: 'schedule task <workflow_or_type> <cron_expression> [json_config]',
    entities: [
      { name: 'taskType', required: true, prompt: 'What type of task or workflow would you like to schedule?' },
      { name: 'schedule', required: true, prompt: 'What is the cron expression for the schedule? (e.g. "0 9 * * *")' }
    ],
    parse: (input) => {
      // Very basic regex to split parts: "schedule task <type> <cron_string> {json}"
      // This is simplified and might need LLM to properly construct in a real scenario
      const match = input.match(/schedule task\s+([\w_]+)\s+((?:\S+\s+){4}\S+)(?:\s+(.+))?$/i);
      if (match) {
        return {
          taskType: match[1],
          schedule: match[2],
          argsString: match[3]
        };
      }
      return {};
    },
    validate: (args) => {
      if (!args.taskType) throw new Error('Task type is required.');
      if (!args.schedule) throw new Error('Cron schedule is required. (e.g. "0 * * * *")');
      if (args.argsString) {
        try { JSON.parse(args.argsString); }
        catch(e) { throw new Error('Config arguments must be valid JSON.'); }
      }
    },
    execute: async (args, context) => {
      const { taskType, schedule, argsString } = args;
      const { userId } = context;

      let commandConfig = { type: taskType, config: {} };
      if (argsString) {
        commandConfig.config = JSON.parse(argsString);
      }

      try {
        if (!context.aximCore || !context.aximCore.api) {
          throw new Error('API client not available.');
        }

        const automation = await context.aximCore.api.createAutomation(
          JSON.stringify(commandConfig),
          schedule,
          userId
        );

        return {
          type: 'success',
          message: `✅ Scheduled task **${taskType}** successfully.\nSchedule: \`${schedule}\`\nID: ${automation.id}`
        };
      } catch (error) {
        return {
          type: 'error',
          message: `Failed to schedule task: ${error.message}`
        };
      }
    }
  })
];
