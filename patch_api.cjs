const fs = require('fs');
let code = fs.readFileSync('src/services/onyxAI/api.js', 'utf8');

const target = `  async resolveHitlAction(logId, status, actionPayload = null) {`;
const replacement = `  async logHitlAction(userId, actionName, toolCalledJson) {
    return this._executeDualWrite('logHitlAction', userId, actionName, toolCalledJson);
  }

  async resolveHitlAction(logId, status, actionPayload = null) {`;

if (code.includes(target) && !code.includes('logHitlAction')) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/services/onyxAI/api.js', code);
}
