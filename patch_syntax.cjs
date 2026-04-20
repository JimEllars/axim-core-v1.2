const fs = require('fs');
let content = fs.readFileSync('src/services/onyxAI/api.js', 'utf8');

content = content.replace(/\\n/g, '\n');

fs.writeFileSync('src/services/onyxAI/api.js', content, 'utf8');
