// src/services/onyxAI/commands/systemCommands.js
import { createCommand } from './commandFactory';
import { DatabaseError, CommandValidationError } from '../errors';
import api from '../api';
import * as llm from '../llm';
import { runWorkflow } from '../../workflows/engine';

const systemCommands = [
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
      const parts = command.split(' ').slice(1);
      const workflowName = parts.join(' ').trim();
      return { WORKFLOW_NAME: workflowName || undefined };
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
                let details = `======= HELP: ${foundCommand.name} =======\n`;
                details += `Description: ${foundCommand.description}\n`;
                details += `Category: ${foundCommand.category || 'General'}\n`;

                if (foundCommand.usage) {
                    details += `Usage: ${foundCommand.usage}\n`;
                }
                if (foundCommand.aliases && foundCommand.aliases.length > 0) {
                    details += `Aliases: ${foundCommand.aliases.join(', ')}\n`;
                }
                if (foundCommand.keywords && foundCommand.keywords.length > 0) {
                    details += `Keywords: ${foundCommand.keywords.join(', ')}\n`;
                }
                details += '===================================';
                return details;

            } else {
                return `Command "${COMMAND_NAME}" not found. Try "help" to see all available commands.`;
            }
        }

        // --- Generic Help Output ---
        const header = '======= ONYX AI HELP =======\n';
        const footer = '============================';

        const groupedCommands = allCommands
            .filter(cmd => !cmd.isDefault)
            .reduce((acc, cmd) => {
                const category = cmd.category || 'General';
                if (!acc[category]) acc[category] = [];
                acc[category].push(cmd);
                return acc;
            }, {});

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
];

export default systemCommands;
