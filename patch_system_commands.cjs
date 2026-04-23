const fs = require('fs');
const path = require('path');

const cmdPath = path.join(__dirname, 'src', 'services', 'onyxAI', 'commands', 'systemCommands.js');
let content = fs.readFileSync(cmdPath, 'utf8');

// Replace monitorBillingAnomalies and auditSecurityCompliance with analyzeInternalInfrastructure
const analyzeInfrastructureCmd = `
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

        let report = \`======= INTERNAL INFRASTRUCTURE REPORT =======\\n\`;
        report += \`• 500 Internal Errors: \${errorCount500}\\n\`;
        report += \`• Webhook Dispatch Failures: \${webhookFailures}\\n\`;
        report += \`• Database Timeouts: \${databaseTimeouts}\\n\`;

        if (errorCount500 > 10 || webhookFailures > 5 || databaseTimeouts > 5) {
            report += \`\\n⚠️ ALERT: Elevated error rates detected. System health may be compromised.\\n\`;

            // Push alert to Admin Dashboard (conceptually)
            await api.logEvent('INFRASTRUCTURE_ALERT', { errorCount500, webhookFailures, databaseTimeouts }, 'system');
        } else {
            report += \`\\n✅ System infrastructure is operating normally.\\n\`;
        }

        report += \`==============================================\`;

        return report;
      } catch (e) {
        console.error("Infrastructure Monitor Error", e);
        return "An error occurred while monitoring internal infrastructure.";
      }
    }
  })
`;

content = content.replace(/createCommand\(\{\s*name: 'monitorBillingAnomalies',[\s\S]*?\}\),\s*createCommand\(\{\s*name: 'infrastructureMonitor'/g, "createCommand({\n    name: 'infrastructureMonitor'");
content = content.replace(/createCommand\(\{\s*name: 'auditSecurityCompliance',[\s\S]*?\}\)/g, analyzeInfrastructureCmd);

fs.writeFileSync(cmdPath, content);
console.log('Updated systemCommands.js');
