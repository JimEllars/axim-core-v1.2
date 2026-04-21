const fs = require('fs');
let code = fs.readFileSync('src/services/gcpApiService.js', 'utf8');

const target = `  async resolveHitlAction(logId, status, actionPayload = null) {`;
const replacement = `  async logHitlAction(userId, actionName, toolCalledJson) {
    return this._fetchWithAuth('/api/v1/hitl', {
      method: 'POST',
      body: JSON.stringify({ userId, action: actionName, toolCalled: toolCalledJson, status: 'pending' }),
    });
  }

  async resolveHitlAction(logId, status, actionPayload = null) {`;

if (code.includes(target) && !code.includes('logHitlAction')) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/gcpApiService.js', code);
}
