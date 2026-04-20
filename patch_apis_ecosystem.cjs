const fs = require('fs');

function patchFile(path, replacementKey, replacementMethod) {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(replacementKey, replacementMethod + '\\n' + replacementKey);
    fs.writeFileSync(path, content, 'utf8');
}

// 1. Supabase API Service
const supabaseMethod = `
  async updateEcosystemAppStatus(appId, newStatus) {
    if (this._checkConnectivity('updateEcosystemAppStatus', [appId, newStatus], true)) return;
    try {
      const { data, error } = await this.supabase
        .from('ecosystem_apps')
        .update({ is_active: newStatus })
        .eq('app_id', appId);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to update ecosystem app status:', error);
      throw new DatabaseError(\`Failed to update ecosystem app status: \${error.message}\`);
    }
  }

  async getAllEcosystemApps() {
    if (this._checkConnectivity('getAllEcosystemApps', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('ecosystem_apps')
        .select('*')
        .order('app_id', { ascending: true });
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to get all ecosystem apps:', error);
      throw new DatabaseError(\`Failed to get all ecosystem apps: \${error.message}\`);
    }
  }
`;
patchFile('src/services/supabaseApiService.js', '// --- External Service Integrations ---', supabaseMethod);


// 2. GCP API Service
const gcpMethod = `
  async updateEcosystemAppStatus(appId, newStatus) {
    this._ensureInitialized();
    try {
      const response = await this.client.patch(\`/ecosystem/apps/\${appId}\`, { is_active: newStatus });
      return response.data;
    } catch (error) {
      logger.error('GCP updateEcosystemAppStatus failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getAllEcosystemApps() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/ecosystem/apps');
      return response.data;
    } catch (error) {
      logger.error('GCP getAllEcosystemApps failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }
`;
patchFile('src/services/gcpApiService.js', '// --- External Service Proxies ---', gcpMethod);


// 3. API JS
const apiMethod = `
  async updateEcosystemAppStatus(appId, newStatus) {
    return this._executeDualWrite('updateEcosystemAppStatus', appId, newStatus);
  }

  async getAllEcosystemApps() {
    return this._executeWithFallback('getAllEcosystemApps');
  }
`;
patchFile('src/services/onyxAI/api.js', '// --- External Service Integrations ---', apiMethod);
