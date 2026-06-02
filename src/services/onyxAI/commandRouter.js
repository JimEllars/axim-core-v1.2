import commands from './commands';
import { CommandNotFoundError } from './errors';

export const findCommand = (command) => {
  const lowerCaseCommand = command.toLowerCase().trim();
  const commandKeyword = lowerCaseCommand.split(' ')[0];

  // First pass: Direct exact keyword match
  let foundCommand = commands.find(c =>
    (c.keywords && c.keywords.includes(commandKeyword)) ||
    (c.aliases && c.aliases.includes(commandKeyword))
  );

  // Second pass: Fuzzy match for multi-word triggers or natural language
  if (!foundCommand) {
    foundCommand = commands.find(c => {
      if (c.keywords) {
        return c.keywords.some(kw => lowerCaseCommand.includes(kw.toLowerCase()));
      }
      return false;
    });
  }

  if (foundCommand) {
    // Return a copy to avoid mutation
    return { ...foundCommand };
  }

  // If no specific command is found, check for a default command.
  const defaultCommand = commands.find(c => c.isDefault);
  if (defaultCommand) {
    return { ...defaultCommand };
  }

  throw new CommandNotFoundError(`Command "${commandKeyword}" not found.`);
};


export const evaluateAnomaly = (confidenceScore, incidentDetails) => {
  if (confidenceScore < 0.85) {
    // Escalate to Tier 4 Action Agent
    return {
      incident_id: incidentDetails.incident_id || `err_${Math.random().toString(16).substring(2, 10)}`,
      target_application: {
        app_id: incidentDetails.app_id || 'unknown-app',
        runtime_environment: 'cloudflare_workers',
        active_branch: 'main',
        repository_source: incidentDetails.repository_source || 'unknown-repo'
      },
      telemetry_context: {
        endpoint: incidentDetails.endpoint || '/unknown',
        http_status: incidentDetails.http_status || 500,
        error_signature: incidentDetails.error_signature || 'Unknown Error',
        stack_trace: incidentDetails.stack_trace || 'No stack trace available',
        last_10_transaction_logs: incidentDetails.last_10_transaction_logs || []
      },
      sandboxed_workspace_rules: {
        allowed_file_paths: [
          'worker.js',
          'wrangler.jsonc',
          'src/utils/paymentService.js'
        ],
        verification_command: 'npm run test && npm run build',
        max_execution_time_seconds: 180,
        quota_token_allocation: 45000
      }
    };
  }
  return null;
};
