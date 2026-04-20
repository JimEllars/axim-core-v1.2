const fs = require('fs');

let content = fs.readFileSync('src/services/supabaseApiService.js', 'utf8');

const verifyApiKeyMethod = `
  async verifyApiKey(apiKey) {
    if (this._checkConnectivity('verifyApiKey', [apiKey])) return;
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('api_key', apiKey)
        .single();
      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new DatabaseError(error.message);
      }
      return data;
    } catch (error) {
      logger.error('Failed to verify API key:', error);
      throw new DatabaseError(\`Failed to verify API key: \${error.message}\`);
    }
  }

  async getDiscoveryCapabilities() {
    if (this._checkConnectivity('getDiscoveryCapabilities', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('ecosystem_apps')
        .select('*')
        .eq('is_active', true);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to get discovery capabilities:', error);
      throw new DatabaseError(\`Failed to get discovery capabilities: \${error.message}\`);
    }
  }

`;

content = content.replace('// --- External Service Integrations ---', verifyApiKeyMethod + '// --- External Service Integrations ---');

fs.writeFileSync('src/services/supabaseApiService.js', content, 'utf8');
