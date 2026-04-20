const fs = require('fs');

// We need to fix the mock in api.js test as we added methods. Wait, the error is TypeError: default.getHitlAuditLog is not a function
// That means the api.js instance doesn't have getHitlAuditLog. Let's check api.js
let content = fs.readFileSync('src/services/onyxAI/api.js', 'utf8');
if (!content.includes('getHitlAuditLog')) {
  console.log("Missing getHitlAuditLog");
} else {
    console.log("Has getHitlAuditLog");
}
