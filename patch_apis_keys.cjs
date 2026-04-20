const fs = require('fs');

function patchFile(path, replacementKey, replacementMethod) {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(replacementKey, replacementMethod + '\\n' + replacementKey);
    fs.writeFileSync(path, content, 'utf8');
}

// 1. Supabase API Service
const supabaseMethod = `
  async getApiKeys(userId) {
    if (this._checkConnectivity('getApiKeys', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to get api keys:', error);
      throw new DatabaseError(\`Failed to get api keys: \${error.message}\`);
    }
  }

  async getPartnerCredit(userId) {
    if (this._checkConnectivity('getPartnerCredit', [userId])) return;
    try {
      const { data, error } = await this.supabase
        .from('partner_credits')
        .select('*')
        .eq('partner_id', userId)
        .maybeSingle();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to get partner credit:', error);
      throw new DatabaseError(\`Failed to get partner credit: \${error.message}\`);
    }
  }

  async generateB2BApiKey(serviceName, userId) {
    if (this._checkConnectivity('generateB2BApiKey', [serviceName, userId], true)) return;
    try {
      const newKey = \`axm_live_\${Math.random().toString(36).substring(2, 15)}\`;
      const { data, error } = await this.supabase
        .from('api_keys')
        .insert({ service: serviceName || 'B2B API Key', api_key: newKey, user_id: userId })
        .select();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to generate B2B api key:', error);
      throw new DatabaseError(\`Failed to generate B2B api key: \${error.message}\`);
    }
  }

  async addApiKey(keyData, userId) {
    if (this._checkConnectivity('addApiKey', [keyData, userId], true)) return;
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .insert({ ...keyData, user_id: userId })
        .select();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to add api key:', error);
      throw new DatabaseError(\`Failed to add api key: \${error.message}\`);
    }
  }

  async updateApiKey(apiKey) {
    if (this._checkConnectivity('updateApiKey', [apiKey], true)) return;
    try {
      const { data, error } = await this.supabase
        .from('api_keys')
        .update({ api_key: apiKey.api_key, service: apiKey.service })
        .eq('id', apiKey.id)
        .select();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to update api key:', error);
      throw new DatabaseError(\`Failed to update api key: \${error.message}\`);
    }
  }

  async deleteApiKey(id) {
    if (this._checkConnectivity('deleteApiKey', [id], true)) return;
    try {
      const { error } = await this.supabase
        .from('api_keys')
        .delete()
        .eq('id', id);
      if (error) throw new DatabaseError(error.message);
      return id;
    } catch (error) {
      logger.error('Failed to delete api key:', error);
      throw new DatabaseError(\`Failed to delete api key: \${error.message}\`);
    }
  }
`;
patchFile('src/services/supabaseApiService.js', '// --- External Service Integrations ---', supabaseMethod);

// 2. GCP API Service
const gcpMethod = `
  async getApiKeys(userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/api-keys', { params: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP getApiKeys failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getPartnerCredit(userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/partner-credits', { params: { userId } });
      return response.data;
    } catch (error) {
      logger.error('GCP getPartnerCredit failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async generateB2BApiKey(serviceName, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/api-keys/b2b', { serviceName, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP generateB2BApiKey failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async addApiKey(keyData, userId) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/api-keys', { ...keyData, userId });
      return response.data;
    } catch (error) {
      logger.error('GCP addApiKey failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async updateApiKey(apiKey) {
    this._ensureInitialized();
    try {
      const response = await this.client.patch(\`/api-keys/\${apiKey.id}\`, apiKey);
      return response.data;
    } catch (error) {
      logger.error('GCP updateApiKey failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async deleteApiKey(id) {
    this._ensureInitialized();
    try {
      const response = await this.client.delete(\`/api-keys/\${id}\`);
      return response.data;
    } catch (error) {
      logger.error('GCP deleteApiKey failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }
`;
patchFile('src/services/gcpApiService.js', '// --- External Service Proxies ---', gcpMethod);

// 3. API JS
const apiMethod = `
  async getApiKeys(userId) {
    return this._executeWithFallback('getApiKeys', userId);
  }

  async getPartnerCredit(userId) {
    return this._executeWithFallback('getPartnerCredit', userId);
  }

  async generateB2BApiKey(serviceName, userId) {
    return this._executeDualWrite('generateB2BApiKey', serviceName, userId);
  }

  async addApiKey(keyData, userId) {
    return this._executeDualWrite('addApiKey', keyData, userId);
  }

  async updateApiKey(apiKey) {
    return this._executeDualWrite('updateApiKey', apiKey);
  }

  async deleteApiKey(id) {
    return this._executeDualWrite('deleteApiKey', id);
  }
`;
patchFile('src/services/onyxAI/api.js', '// --- External Service Integrations ---', apiMethod);
