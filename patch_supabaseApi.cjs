const fs = require('fs');
let code = fs.readFileSync('src/services/supabaseApiService.js', 'utf8');

const target = `  async resolveHitlAction(logId, status, actionPayload = null) {`;
const replacement = `  async logHitlAction(userId, actionName, toolCalledJson) {
    if (!this.supabase) throw new Error("Supabase client not initialized.");

    // Create the log entry
    const { data, error } = await this.supabase.from('hitl_audit_logs').insert({
      admin_id: userId,
      action: actionName,
      tool_called: toolCalledJson,
      status: 'pending'
    }).select().single();
    if (error) throw error;
    return data;
  }

  async resolveHitlAction(logId, status, actionPayload = null) {`;

if (code.includes(target) && !code.includes('logHitlAction')) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/supabaseApiService.js', code);
}
