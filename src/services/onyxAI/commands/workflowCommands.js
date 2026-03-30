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
    description: 'Executes a specific automation workflow.',
    keywords: ['run workflow', 'start workflow', 'execute workflow'],
    category: 'Workflows',
    usage: 'run workflow <slug> [json_arguments]',
    entities: [
      { name: 'slug', required: true, prompt: 'Which workflow would you like to run?' }
    ],
    parse: (input) => {
      // Regex to capture the slug and the optional remainder (arguments)
      // Matches: "run workflow my_slug" or "run workflow my_slug { ... }"
      const match = input.match(/workflow\s+([\w_]+)(?:\s+(.+))?$/i);
      if (match) {
        return {
          slug: match[1],
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
            workflow = dbWorkflows.find(w => w.slug === slug);
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
  })
];
