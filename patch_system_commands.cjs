const fs = require('fs');

let content = fs.readFileSync('src/services/onyxAI/commands/systemCommands.js', 'utf8');

// Insert monitorBillingAnomalies
// Action: If Onyx detects that a partner's API usage has spiked 500% above their 7-day moving average,
// Onyx should automatically dispatch a warning email to the partner (via our send-email edge function)
// and push an alert to the Admin Dashboard suggesting a temporary rate-limit intervention.
// Wait, to push an alert to the admin dashboard, we can just return a string or insert a task or hitl_audit_logs, or telemetry.
// The instructions say: "add a new command: monitorBillingAnomalies. If Onyx detects ... dispatch a warning email ... and push an alert to the Admin Dashboard".
// The existing `createTaskForProject` or `hitl_audit_logs` can be used. Let's just create a scheduled task or log an event.
// Let's use `api.logEvent` or `api.invokeAximService` or `api.createTaskForProject`.

const commandStr = `
  createCommand({
    name: 'monitorBillingAnomalies',
    description: 'Monitors partner API usage to detect and prevent bill shock.',
    keywords: ['monitor-billing', 'check billing', 'billing anomalies'],
    usage: 'monitor-billing',
    category: 'System',
    async execute(args, { aximCore }) {
      try {
        const { supabase } = await import('../../supabaseClient.js');
        const api = (await import('../api.js')).default;

        // Fetch logs for the past 8 days
        const eightDaysAgo = new Date();
        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

        const { data: logs, error } = await supabase
          .from('api_usage_logs')
          .select('partner_id, created_at')
          .gte('created_at', eightDaysAgo.toISOString());

        if (error || !logs) {
          return "Failed to fetch API usage logs for monitoring.";
        }

        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // Group by partner
        const usageByPartner = {};

        logs.forEach(log => {
          const logTime = new Date(log.created_at).getTime();
          const isLast24Hours = (now - logTime) <= oneDayMs;

          if (!usageByPartner[log.partner_id]) {
            usageByPartner[log.partner_id] = { last24h: 0, previous7d: 0 };
          }

          if (isLast24Hours) {
            usageByPartner[log.partner_id].last24h++;
          } else {
            usageByPartner[log.partner_id].previous7d++;
          }
        });

        const anomalies = [];

        for (const partnerId of Object.keys(usageByPartner)) {
          const stats = usageByPartner[partnerId];
          const dailyAverage7d = stats.previous7d / 7;

          // Spike 500% means last24h > dailyAverage7d * 6 (or 5 depending on interpretation, let's use 5)
          if (dailyAverage7d > 10 && stats.last24h > dailyAverage7d * 5) {
             anomalies.push(partnerId);

             // Fetch partner email
             const { data: userData } = await supabase.auth.admin.getUserById(partnerId);
             if (userData?.user?.email) {
                // Dispatch warning email
                const emailSubject = "AXiM Critical Alert: API Usage Spike Detected";
                const emailBody = \`Hello, we have detected a massive (\${Math.round((stats.last24h / dailyAverage7d) * 100)}%) spike in your API usage over the past 24 hours. Your 7-day average was \${Math.round(dailyAverage7d)}, but you have made \${stats.last24h} requests today. Please review your usage immediately to prevent bill shock.\`;

                await api.sendEmail(userData.user.email, emailSubject, emailBody, 'system');

                // Push alert to Admin Dashboard
                await api.logEvent('BILLING_ANOMALY', { partnerId, last24h: stats.last24h, average: dailyAverage7d }, 'system');
             }
          }
        }

        if (anomalies.length > 0) {
          return \`Detected \${anomalies.length} billing anomalies. Warning emails and admin alerts dispatched.\`;
        }

        return "Billing anomaly monitor completed. No anomalies detected.";
      } catch (e) {
        console.error("Monitor Billing Error", e);
        return "An error occurred while monitoring billing anomalies.";
      }
    }
  }),
`;

// Insert the command before the last element of the array
const infrastructureMonitorCommandStr = `  createCommand({
    name: 'infrastructureMonitor',`;

content = content.replace(infrastructureMonitorCommandStr, commandStr + "\n" + infrastructureMonitorCommandStr);

fs.writeFileSync('src/services/onyxAI/commands/systemCommands.js', content);
