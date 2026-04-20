const fs = require('fs');

let content = fs.readFileSync('src/services/gcpApiService.js', 'utf8');

const verifyApiKeyMethod = `
  async verifyApiKey(apiKey) {
    this._ensureInitialized();
    try {
      const response = await this.client.post('/api-keys/verify', { apiKey });
      return response.data;
    } catch (error) {
      logger.error('GCP verifyApiKey failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

  async getDiscoveryCapabilities() {
    this._ensureInitialized();
    try {
      const response = await this.client.get('/discovery/capabilities');
      return response.data;
    } catch (error) {
      logger.error('GCP getDiscoveryCapabilities failed:', error);
      throw new DatabaseError(error.response?.data?.error || error.message);
    }
  }

`;

content = content.replace('// --- External Service Proxies ---', verifyApiKeyMethod + '// --- External Service Proxies ---');

fs.writeFileSync('src/services/gcpApiService.js', content, 'utf8');
