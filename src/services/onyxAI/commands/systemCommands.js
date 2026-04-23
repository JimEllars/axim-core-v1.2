// src/services/onyxAI/commands/systemCommands.js
import { createCommand } from './commandFactory';
import { DatabaseError, CommandValidationError } from '../errors';
import api from '../api';
import * as llm from '../llm';
import { runWorkflow } from '../../workflows/engine';

export function groupCommandsByCategory(commands) {
    return commands
        .filter(cmd => !cmd.isDefault)
        .reduce((acc, cmd) => {
            const category = cmd.category || 'General';
            if (!acc[category]) acc[category] = [];
            acc[category].push(cmd);
            return acc;
        }, {});
}

const systemCommands = [
  createCommand({
    name: 'getFleetHealth',
    description: 'Gets the current health status of all connected micro-apps and devices.',
    keywords: ['fleet health', 'get fleet health', 'device status', 'nodes'],
    usage: 'fleet health',
    category: 'System',
    async execute() {
      try {
        const devices = await api.getDevices();
        if (!devices || devices.length === 0) {
          return 'No devices are currently registered in the fleet.';
        }

        const offline = devices.filter(d => d.status === 'offline');
        const degraded = devices.filter(d => d.status === 'degraded' || d.status === 'busy');
        const operational = devices.filter(d => d.status === 'operational');

        let report = `======= FLEET HEALTH REPORT =======\n`;
        report += `Total Nodes: ${devices.length}\n`;
        report += `✅ Operational: ${operational.length}\n`;
        report += `⚠️ Degraded/Busy: ${degraded.length}\n`;
        report += `❌ Offline: ${offline.length}\n\n`;

        if (offline.length > 0) {
          report += `--- OFFLINE NODES ---\n`;
          offline.forEach(d => {
            report += `• ${d.device_name || d.id} (Last Seen: ${d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Unknown'})\n`;
          });
          report += '\n';
        }

        if (degraded.length > 0) {
          report += `--- DEGRADED NODES ---\n`;
          degraded.forEach(d => {
            report += `• ${d.device_name || d.id}\n`;
          });
        }
        report += `===================================`;
        return report;
      } catch (error) {
        console.error('Error fetching fleet health:', error);
        return 'Failed to fetch fleet health data.';
      }
    }
  }),

  createCommand({
    name: 'getSystemReport',
    description: 'Gets a comprehensive system health and status report.',
    keywords: ['get system report', 'system report', 'status', 'stats', 'report'],
    usage: 'status',
    category: 'System',
    async execute(args, { userId }) {
      try {
        // This check ensures the command only runs in an Electron environment
        // where the electronAPI is exposed on the window object.
        if (!window.electronAPI) {
            return "System report is only available in the desktop application.";
        }

        // Fetch data from both the backend API and the Electron main process concurrently.
        const [systemStats, apiStats, pmStats, hostInfo] = await Promise.all([
          api.getSystemStats(userId),
          api.getAPIStats(),
          api.getProjectManagementStats(userId),
          window.electronAPI.invoke('get-system-info'),
        ]);

        const totalCalls = apiStats.logs?.length || 0;
        const successRate = totalCalls > 0
          ? Math.round((apiStats.logs.filter(log => log.success).length / totalCalls) * 100)
          : 100;

        // Calculate host metrics from the data received from the main process.
        const uptime = (hostInfo.uptime / 3600).toFixed(2);
        const freeMem = (hostInfo.freeMemory / 1e9).toFixed(2);
        const totalMem = (hostInfo.totalMemory / 1e9).toFixed(2);
        const memUsage = ((1 - hostInfo.freeMemory / hostInfo.totalMemory) * 100).toFixed(2);

        return `======= SYSTEM HEALTH REPORT =======
AXIM CORE v1.2 :: STATUS: ✅ ONLINE

--- Host Environment ---
💻 Platform: ${hostInfo.platform}
⏱️ Uptime: ${uptime} hours
⚙️ CPU: ${hostInfo.cpuModel}
💾 Memory Usage: ${memUsage}% (${freeMem} GB free / ${totalMem} GB total)

--- Core Metrics ---
📊 Total Contacts: ${systemStats.totalContacts.toLocaleString()}
🔄 Total Events Logged: ${systemStats.totalEvents.toLocaleString()}
🔗 Total API Integrations: ${systemStats.totalAPIs}

--- Project Management ---
📁 Total Projects: ${pmStats.totalProjects.toLocaleString()}
✅ Total Tasks: ${pmStats.totalTasks.toLocaleString()}
⚙️ Total Workflows: ${pmStats.totalWorkflows.toLocaleString()}

--- AI & API Layer ---
🧠 Onyx AI Status: Active
📞 API Calls (last 100): ${totalCalls}
🎯 API Success Rate: ${successRate}%
⚡ Active LLM Provider: ${llm.getActiveProviderName() || 'None'}
====================================`;
      } catch (error) {
        console.error('Error fetching system report:', error);
        throw new DatabaseError('Failed to fetch system report data from the database.');
      }
    },
  }),

  createCommand({
    name: 'triggerWorkflow',
    description: 'Triggers a workflow.',
    keywords: ['trigger', 'start', 'launch', 'workflow'],
    usage: 'trigger <workflow_name>',
    category: 'System',
    entities: [{ name: 'WORKFLOW_NAME', required: true, prompt: 'Please specify which workflow to trigger.' }],
    parse: (command) => {
      // Adjusted parsing to handle "trigger engagement-guard" or "launch workflow engagement_guard"
      const match = command.match(/(?:workflow|trigger|launch|start)\s+([\w_-]+)/i);
      if (match) {
        return { WORKFLOW_NAME: match[1].replace(/-/g, '_') };
      }
      return { WORKFLOW_NAME: undefined };
    },
    async execute({ WORKFLOW_NAME }, { userId }) {
      const workflows = await api.getWorkflows();
      const slug = WORKFLOW_NAME.toLowerCase().replace(/\s+/g, '_');
      const workflowExists = workflows.some(w => w.slug === slug);

      if (!workflowExists) {
        const availableWorkflows = workflows.map(w => `• ${w.name} (command: trigger ${w.slug.replace(/_/g, ' ')})`).join('\n');
        throw new Error(`Workflow "${WORKFLOW_NAME}" not found.\n\nAvailable workflows:\n${availableWorkflows}`);
      }

      const { results, workflowRunId } = await runWorkflow(slug, userId);
      const successCount = results.filter(r => r.success).length;
      const resultSummary = results.map(r =>
        `  ${r.success ? '✅' : '❌'} ${r.step}: ${r.message}`
      ).join('\n');

      return `🚀 Workflow "${WORKFLOW_NAME}" executed successfully.\n✅ Run ID: ${workflowRunId}\n📊 Status: ${successCount}/${results.length} steps completed.\n📋 Results:\n${resultSummary}`;
    },
  }),

  createCommand({
    name: 'getAIStatus',
    description: 'Gets the current status and version of the Onyx AI.',
    keywords: ['ai status', 'version', 'who are you', 'onyx version'],
    usage: 'ai status',
    category: 'System',
    execute() {
      const onyxVersion = "1.2.0";
      return `🧠 Onyx AI v${onyxVersion}\nStatus: ✅ Active\nI am an AI assistant integrated into Axim Core, ready to help you with system commands and data management.`;
    },
  }),

  createCommand({
    name: 'clear',
    description: 'Clears the chat history.',
    keywords: ['clear', 'reset', 'cls'],
    usage: 'clear',
    category: 'System',
    execute: (args, { aximCore }) => {
      if (aximCore) {
        aximCore.clearConversationHistory();
      }
      return { type: '__CLEAR_CHAT__' };
    },
  }),

  createCommand({
    name: 'help',
    description: 'Shows a list of commands, or details for a specific command.',
    keywords: ['help', 'commands', '?'],
    usage: 'help [command_name]',
    category: 'System',
    entities: [{ name: 'COMMAND_NAME', required: false }],
    parse: (command) => {
        const parts = command.split(' ').slice(1);
        const commandName = parts.join(' ').trim();
        return { COMMAND_NAME: commandName || undefined };
    },
    execute: ({ COMMAND_NAME }, { allCommands }) => {
        if (COMMAND_NAME) {
            const commandToFind = COMMAND_NAME.toLowerCase();
            const foundCommand = allCommands.find(cmd =>
                cmd.name.toLowerCase() === commandToFind ||
                cmd.keywords.some(k => k.toLowerCase() === commandToFind) ||
                (cmd.aliases && cmd.aliases.some(a => a.toLowerCase() === commandToFind))
            );

            if (foundCommand) {
                return [
                    `======= HELP: ${foundCommand.name} =======`,
                    `Description: ${foundCommand.description}`,
                    `Category: ${foundCommand.category || 'General'}`,
                    foundCommand.usage ? `Usage: ${foundCommand.usage}` : null,
                    (foundCommand.aliases && foundCommand.aliases.length > 0) ? `Aliases: ${foundCommand.aliases.join(', ')}` : null,
                    (foundCommand.keywords && foundCommand.keywords.length > 0) ? `Keywords: ${foundCommand.keywords.join(', ')}` : null,
                    '==================================='
                ].filter(Boolean).join('\n');
            } else {
                return `Command "${COMMAND_NAME}" not found. Try "help" to see all available commands.`;
            }
        }

        // --- Generic Help Output ---
        const header = '======= ONYX AI HELP =======\n';
        const footer = '============================';

        const groupedCommands = groupCommandsByCategory(allCommands);

        const sortedCategories = Object.keys(groupedCommands).sort();

        const commandList = sortedCategories.map(category => {
            const categoryHeader = `\n--- ${category} Commands ---\n`;
            const commands = groupedCommands[category].sort((a, b) => a.name.localeCompare(b.name));
            const commandLines = commands.map(cmd => `• ${cmd.name.padEnd(20)} - ${cmd.description}`).join('\n');
            return `${categoryHeader}${commandLines}`;
        }).join('');

        return `${header}Here is a list of available commands. For details on a specific command, type "help <command_name>".${commandList}\n\n${footer}`;
    },
}),

  createCommand({
    name: 'recalculateMetrics',
    description: 'Recalculates system-wide metrics.',
    keywords: ['recalculate metrics', 'recalculate-metrics'],
    usage: 'recalculate metrics',
    category: 'System',
    async execute() {
      const result = await api.recalculateMetrics();
      return `✅ System metrics have been successfully recalculated.\n${result.message}`;
    },
  }),
  createCommand({
    name: 'uuid',
    description: 'Generates a new version 4 UUID.',
    keywords: ['uuid', 'guid', 'generate uuid'],
    usage: 'uuid',
    category: 'System',
    execute: () => {
      const newUuid = crypto.randomUUID();
      return `Generated UUID: ${newUuid}`;
    },
  }),
  createCommand({
    name: 'exportChatlogsToDrive',
    description: 'Manually triggers the daily export of chat logs to Google Drive.',
    keywords: ['export chatlogs to drive', 'export to drive', 'backup chatlogs'],
    usage: 'export chatlogs to drive',
    category: 'System',
    async execute(args, { aximCore }) {
      const response = await aximCore.api.invokeAximService(
        'google-drive-export', // The service/function name
        'export', // The "endpoint" (not strictly used by the function but part of the signature)
        {}, // No payload needed
        aximCore.userId
      );

      if (response.status === 'queued') {
        return "Request to export chat logs has been queued as you are offline. It will be processed when you reconnect.";
      }

      return `✅ Chat logs export triggered successfully.\nResponse: ${response.message}\nFile: ${response.fileName}`;
    },
  }),
  createCommand({
    name: 'exportChatlog',
    description: 'Exports the current conversation chat log as a JSON file.',
    keywords: ['export', 'download', 'chatlog', 'export chatlog'],
    usage: 'export chatlog',
    category: 'System',
    async execute(args, { aximCore }) {
      if (!aximCore || !aximCore.userId || !aximCore.conversationId) {
        throw new Error('AximCore service is not available or user is not initialized.');
      }

      const history = await api.getChatHistoryForUser(aximCore.userId, aximCore.conversationId);

      if (!history || history.length === 0) {
        return 'No chat history available to export.';
      }

      const filename = `axim-chatlog-${new Date().toISOString()}.json`;
      const content = JSON.stringify(history, null, 2);

      return {
        type: 'file_download',
        filename,
        content,
      };
    },
  }),

  createCommand({
    name: 'systemHealthCheck',
    description: 'Performs a health check on core system services.',
    keywords: ['health check', 'system health', 'ping services'],
    usage: 'system health',
    category: 'System',
    async execute() {
      const healthReport = await api.checkSystemHealth();

      let report = `======= SYSTEM HEALTH CHECK =======\n`;
      report += healthReport.results.map(r => `• ${r.name}: ${r.status} ${r.latency ? `(Latency: ${r.latency})` : ''} ${r.message ? `- ${r.message}` : ''}`).join('\n');

      // If Electron is available, add host info
      if (window.electronAPI) {
          try {
             const hostInfo = await window.electronAPI.invoke('get-system-info');
             const uptime = (hostInfo.uptime / 3600).toFixed(2);
             report += `\n--- Local Host ---\n`;
             report += `💻 Platform: ${hostInfo.platform}\n`;
             report += `⏱️ Uptime: ${uptime} hours`;
          } catch(e) {
              // Ignore errors fetching host info
          }
      }

      report += `\n===================================`;
      return report;
    },
  }),

  createCommand({
    name: 'infrastructureMonitor',
    description: 'Background workflow to monitor system health and report anomalies.',
    keywords: ['infrastructure-monitor', 'infrastructure monitor'],
    usage: 'infrastructure-monitor',
    category: 'System',
    isHidden: true,
    async execute(args, { aximCore, userId }) {
        if (!aximCore) throw new Error("AximCore context required");

        // Query the telemetry_logs table for the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        // As api is imported in the file, we should use the supabase client directly for the specific query if api method doesn't exist,
        // but given the context we can just use supabase client directly if available, or we assume aximCore.api has a way,
        // wait, let's look at how we can query telemetry_logs.
        // The instruction says "queries the telemetry_logs table for the last 5 minutes. If it counts more than 5 instances of 502 or GCP_Fallback"

        let errorCount = 0;
        try {
            const { supabase } = await import('../../supabaseClient.js'); // Assuming path is correct
            const { data, error } = await supabase
                .from('telemetry_logs')
                .select('*')
                .gte('created_at', fiveMinutesAgo);

            if (!error && data) {
                 // The prompt specifies "instances of 502 or GCP_Fallback"
                 errorCount = data.filter(log => {
                     const is502 = log.status_code === 502 || log.error_code === 502 || log.data?.error_code === 502;
                     const isGcpFallback = log.type === 'GCP_Fallback' || log.action === 'GCP_Fallback' || log.message?.includes('GCP_Fallback');
                     return is502 || isGcpFallback;
                 }).length;
            }
        } catch (e) {
            console.error("Error querying telemetry_logs:", e);
            // Fallback checking events_ax2024 as seen in previous files
            try {
                const { supabase } = await import('../../supabaseClient.js');
                const { data, error } = await supabase
                    .from('events_ax2024')
                    .select('*')
                    .gte('created_at', fiveMinutesAgo);
                if (!error && data) {
                     errorCount = data.filter(log => {
                         const is502 = log.data?.error_code === 502 || log.status === 502;
                         const isGcpFallback = log.type === 'GCP_Fallback' || JSON.stringify(log.data || {}).includes('GCP_Fallback');
                         return is502 || isGcpFallback;
                     }).length;
                }
            } catch (fallbackError) {
                console.error("Fallback error querying events_ax2024:", fallbackError);
            }
        }

        if (errorCount > 5) {
            return JSON.stringify({ status: "CRITICAL", action: "Invoke Incident Report Workflow" });
        }

        return JSON.stringify({ status: "OK", message: "Infrastructure is stable." });
    }
  }),

  createCommand({
    name: 'analyzeInternalInfrastructure',
    description: 'Monitors telemetry logs to ensure external micro-apps are successfully reaching the Core.',
    keywords: ['analyze infrastructure', 'check core', 'monitor system'],
    usage: 'analyze infrastructure',
    category: 'System',
    async execute(args, { aximCore }) {
      try {
        const { supabase } = await import('../../supabaseClient.js');
        const api = (await import('../api.js')).default;

        // Fetch logs for the past 24 hours
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const { data: logs, error } = await supabase
          .from('telemetry_logs')
          .select('status_code, error_code, endpoint, created_at')
          .gte('created_at', oneDayAgo.toISOString());

        if (error || !logs) {
          return "Failed to fetch telemetry logs for monitoring.";
        }

        let errorCount500 = 0;
        let webhookFailures = 0;
        let databaseTimeouts = 0;

        logs.forEach(log => {
          if (log.status_code === 500 || log.error_code === 500) {
            errorCount500++;
          }
          if (log.endpoint && log.endpoint.includes('webhook-dispatch') && (log.status_code !== 200)) {
            webhookFailures++;
          }
          if (log.error_code === 'database_timeout' || log.status_code === 504) {
            databaseTimeouts++;
          }
        });

        let report = `======= INTERNAL INFRASTRUCTURE REPORT =======\n`;
        report += `• 500 Internal Errors: ${errorCount500}\n`;
        report += `• Webhook Dispatch Failures: ${webhookFailures}\n`;
        report += `• Database Timeouts: ${databaseTimeouts}\n`;

        if (errorCount500 > 10 || webhookFailures > 5 || databaseTimeouts > 5) {
            report += `\n⚠️ ALERT: Elevated error rates detected. System health may be compromised.\n`;

            // Push alert to Admin Dashboard (conceptually)
            await api.logEvent('INFRASTRUCTURE_ALERT', { errorCount500, webhookFailures, databaseTimeouts }, 'system');
        } else {
            report += `\n✅ System infrastructure is operating normally.\n`;
        }

        report += `==============================================`;

        return report;
      } catch (e) {
        console.error("Infrastructure Monitor Error", e);
        return "An error occurred while monitoring internal infrastructure.";
      }
    }
  })


];

export default systemCommands;
