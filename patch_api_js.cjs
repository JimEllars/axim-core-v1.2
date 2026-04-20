const fs = require('fs');

let content = fs.readFileSync('src/services/onyxAI/api.js', 'utf8');

const verifyApiKeyMethod = `
  async verifyApiKey(apiKey) {
    return this._executeWithFallback('verifyApiKey', apiKey);
  }

  async getDiscoveryCapabilities() {
    return this._executeWithFallback('getDiscoveryCapabilities');
  }

`;

content = content.replace('// --- External Service Integrations ---', verifyApiKeyMethod + '// --- External Service Integrations ---');

fs.writeFileSync('src/services/onyxAI/api.js', content, 'utf8');
