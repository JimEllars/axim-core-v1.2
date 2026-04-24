const fs = require('fs');
const filePath = 'src/services/onyxAI/commands/systemCommands.js';
let content = fs.readFileSync(filePath, 'utf8');

const newTool = `
  createCommand({
    name: 'triggerExternalWorkflow',
    description: 'Triggers an external SaaS workflow via the Universal Dispatcher.',
    keywords: ['trigger workflow', 'external workflow', 'run zapier', 'run texau', 'run emailit'],
    usage: 'triggerExternalWorkflow <service_name> | <workflow_payload>',
    category: 'System',
    async execute(args, { aximCore }) {
      if (!args || typeof args !== 'string') {
        return "Please provide the target service and workflow payload separated by a pipe (|).";
      }

      let service_name, workflow_payload;
      try {
        const parsed = JSON.parse(args);
        service_name = parsed.service_name;
        workflow_payload = parsed.workflow_payload;
      } catch (e) {
        const parts = args.split('|').map(s => s.trim());
        if (parts.length >= 2) {
          service_name = parts[0];
          try {
            workflow_payload = JSON.parse(parts.slice(1).join(' | '));
          } catch(err) {
            // Treat as string payload if not valid JSON
            workflow_payload = { data: parts.slice(1).join(' | ') };
          }
        } else {
          return "Invalid arguments. Provide service_name | workflow_payload.";
        }
      }

      if (!service_name || !workflow_payload) {
        return "Missing required arguments: service_name and workflow_payload.";
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
      const internalKey = import.meta.env.VITE_AXIM_INTERNAL_SERVICE_KEY || import.meta.env.VITE_AXIM_SERVICE_KEY || 'fallback_internal_key';

      try {
        const response = await fetch(\`\${supabaseUrl}/functions/v1/universal-dispatcher\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Axim-Internal-Service-Key': internalKey
          },
          body: JSON.stringify({
            target_service: service_name,
            action_type: 'automated_workflow',
            payload: workflow_payload
          })
        });

        if (!response.ok) {
           const errorData = await response.json();
           console.error("External Workflow Trigger Error:", errorData);
           return \`Failed to trigger workflow on \${service_name}: \${errorData.error || 'Unknown error'}\`;
        }

        const data = await response.json();
        return \`✅ Successfully triggered workflow on \${service_name}. Downstream response: \${data.downstreamResponse}\`;
      } catch (error) {
        console.error("Trigger Workflow System Error:", error);
        return "An internal error occurred while triggering the external workflow.";
      }
    }
  }),
`;

// Insert the new tool before the last '];'
content = content.replace(/\];\s*export default systemCommands;/, newTool + '];\n\nexport default systemCommands;');
fs.writeFileSync(filePath, content);
