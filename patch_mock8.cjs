const fs = require('fs');

let content = fs.readFileSync('src/services/onyxAI/__tests__/api.test.js', 'utf8');
content = content.replace("api = (await import('../api.js')).default;", "api = (await import('../api')).default;");
fs.writeFileSync('src/services/onyxAI/__tests__/api.test.js', content, 'utf8');
