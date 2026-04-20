const fs = require('fs');

function patchFile(path, replacementKey, replacementMethod) {
    let content = fs.readFileSync(path, 'utf8');
    content = content.replace(replacementKey, replacementMethod + '\\n' + replacementKey);
    fs.writeFileSync(path, content, 'utf8');
}

// 1. Supabase API Service
const supabaseMethod = `
  async submitProductFeedback(feedback) {
    if (this._checkConnectivity('submitProductFeedback', [feedback], true)) return;
    try {
      const { data, error } = await this.supabase
        .from('product_feedback')
        .insert([feedback])
        .select();
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to submit product feedback:', error);
      throw new DatabaseError(\`Failed to submit product feedback: \${error.message}\`);
    }
  }

  async getProductFeedback() {
    if (this._checkConnectivity('getProductFeedback', [])) return;
    try {
      const { data, error } = await this.supabase
        .from('product_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new DatabaseError(error.message);
      return data;
    } catch (error) {
      logger.error('Failed to get product feedback:', error);
      throw new DatabaseError(\`Failed to get product feedback: \${error.message}\`);
    }
  }
`;
patchFile('src/services/supabaseApiService.js', '// --- External Service Integrations ---', supabaseMethod);

// 2. GCP API Service
const gcpMethod = `
  async submitProductFeedback(feedback) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/feedback', feedback);
      return response.data;
    } catch (error) {
      logger.error('GCP submitProductFeedback failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getProductFeedback() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/feedback');
      return response.data;
    } catch (error) {
      logger.error('GCP getProductFeedback failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }
`;
patchFile('src/services/gcpApiService.js', '// --- External Service Proxies ---', gcpMethod);

// 3. API JS
const apiMethod = `
  async submitProductFeedback(feedback) {
    return this._executeDualWrite('submitProductFeedback', feedback);
  }

  async getProductFeedback() {
    return this._executeWithFallback('getProductFeedback');
  }
`;
patchFile('src/services/onyxAI/api.js', '// --- External Service Integrations ---', apiMethod);
