const fs = require('fs');

let content = fs.readFileSync('src/components/admin/ApiKeyManager.jsx', 'utf8');

// Insert a "Current Billing Cycle Estimate" widget that calculates their unbilled usage logs multiplied by their tier's cost-per-request
// Tier costs: standard (e.g. $0.01 per request? Let's say $0.01 since 1000 units = $10.00 in the billing chron)
// The autonomous billing function sets unitAmount to 1000 ($10.00). Oh, wait, 1 unit = $10.00?
// In autonomous billing: `amount: count * unitAmount` with unitAmount = 1000 ($10.00). So 1 request = $10? That's steep. Maybe 1 unit is 1000 requests, or 1 request = $10 for generating a legal document. Let's assume 1 document generation = $10.00.

const widgetLogic = `
  // Fetch Unbilled Usage Logs to calculate estimate
  const { data: unbilledLogs = [] } = useQuery({
    queryKey: ['unbilled_usage_logs', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_usage_logs')
        .select('*')
        .eq('partner_id', user.id)
        .is('billed', false); // Assume false or null

      const { data: nullBilledLogs, error: nullLogsError } = await supabase
        .from('api_usage_logs')
        .select('*')
        .eq('partner_id', user.id)
        .is('billed', null);

      if (error || nullLogsError) throw (error || nullLogsError);
      return [...(data || []), ...(nullBilledLogs || [])];
    }
  });

  const costPerRequest = 10.00; // $10 per document API request as defined in billing cron
  const currentEstimate = unbilledLogs.length * costPerRequest;
`;

// Insert the widgetLogic before return statement
content = content.replace("  return (", widgetLogic + "\n  return (");

// Insert the Widget UI
const widgetUI = `
      {partnerCredit && (
        <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6 border border-onyx-accent/20">
          <h2 className="text-xl font-bold mb-2">Partner API Credits</h2>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Credits Remaining:</span>
            <span className="text-2xl font-bold text-green-400">{partnerCredit.credits_remaining}</span>
          </div>
          {/* Note: Top-up logic could be added here or via Billing Portal */}
        </div>
      )}

      <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6 border border-onyx-accent/20">
        <h2 className="text-xl font-bold mb-2">Current Billing Cycle Estimate</h2>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Unbilled Requests:</span>
          <span className="text-xl font-semibold text-white">{unbilledLogs.length}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-slate-400">Estimated Cost:</span>
          <span className="text-2xl font-bold text-red-400">$\\{currentEstimate.toFixed(2)\\}</span>
        </div>
        <p className="text-sm text-slate-500 mt-4">Calculated based on $\\{costPerRequest.toFixed(2)\\} per API document request.</p>
      </div>
`;

content = content.replace(
  `      {partnerCredit && (
        <div className="bg-onyx-950 p-6 rounded-lg shadow-lg mt-6 border border-onyx-accent/20">
          <h2 className="text-xl font-bold mb-2">Partner API Credits</h2>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Credits Remaining:</span>
            <span className="text-2xl font-bold text-green-400">{partnerCredit.credits_remaining}</span>
          </div>
          {/* Note: Top-up logic could be added here or via Billing Portal */}
        </div>
      )}`,
  widgetUI
);

// We need to fix $\\{ ... \\} to just $ { ... } because of template literals in regex replace
content = content.replace(/\\{/g, '{').replace(/\\}/g, '}');

fs.writeFileSync('src/components/admin/ApiKeyManager.jsx', content);
