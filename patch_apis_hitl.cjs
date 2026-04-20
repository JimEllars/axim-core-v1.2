const fs = require('fs');

function patchFile(path, replacementKey, replacementMethod) {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(replacementKey, replacementMethod + '\\n' + replacementKey);
    fs.writeFileSync(path, content, 'utf8');
}

// 1. Supabase API Service
const supabaseHitlMethod = `
  async resolveHitlAction(logId, status, actionPayload = null) {
    if (this._checkConnectivity('resolveHitlAction', [logId, status, actionPayload], true)) {
      return Promise.resolve();
    }
    try {
      const { data, error } = await this.supabase.rpc('resolve_hitl_action', {
        p_log_id: logId,
        p_status: status,
        p_action_payload: actionPayload
      });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to resolve HITL action:', error);
      throw new DatabaseError(\`Failed to resolve HITL action: \${error.message}\`);
    }
  }

  async getHitlAuditLog(logId) {
    if (this._checkConnectivity('getHitlAuditLog', [logId])) return;
    try {
      const { data, error } = await this.supabase
        .from('hitl_audit_logs')
        .select('*')
        .eq('id', logId)
        .single();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to get HITL audit log:', error);
      throw new DatabaseError(\`Failed to get HITL audit log: \${error.message}\`);
    }
  }
`;
patchFile('src/services/supabaseApiService.js', '// --- External Service Integrations ---', supabaseHitlMethod);


// 2. GCP API Service
const gcpHitlMethod = `
  async resolveHitlAction(logId, status, actionPayload = null) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/hitl/resolve', { logId, status, actionPayload });
      return response.data;
    } catch (error) {
      logger.error('GCP resolveHitlAction failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getHitlAuditLog(logId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get(\`/hitl/\${logId}\`);
      return response.data;
    } catch (error) {
      logger.error('GCP getHitlAuditLog failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }
`;
patchFile('src/services/gcpApiService.js', '// --- External Service Proxies ---', gcpHitlMethod);


// 3. API JS
const apiHitlMethod = `
  async resolveHitlAction(logId, status, actionPayload = null) {
    return this._executeDualWrite('resolveHitlAction', logId, status, actionPayload);
  }

  async getHitlAuditLog(logId) {
    return this._executeWithFallback('getHitlAuditLog', logId);
  }
`;
patchFile('src/services/onyxAI/api.js', '// --- External Service Integrations ---', apiHitlMethod);
