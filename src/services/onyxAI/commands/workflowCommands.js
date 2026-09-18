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
      const { slug, argsString } = args;
      const { userId, aximCore } = context;

      let initialContext = {};
      if (argsString) {
        initialContext = JSON.parse(argsString);
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
        const serviceKey = import.meta.env.VITE_AXIM_SERVICE_KEY || import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

        const response = await fetch(`${supabaseUrl}/functions/v1/trigger-workflow`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            workflow: slug,
            userId: userId || 'system',
            context: initialContext
          })
        });

        if (!response.ok) {
           const errorData = await response.json();
           throw new Error(errorData.error || 'Unknown error');
        }

        const data = await response.json();

        return {
            type: 'success',
            message: `Workflow **${slug}** triggered successfully.\n\nMessage: ${data.message || 'Workflow executed'}`,
            data: data
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
